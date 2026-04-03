use crate::types::{
    SenaAnalysisResult, SenaDiagnostics, SenaLeadTimePosteriorPoint, SenaObservationRecord,
    SenaPipelinePosteriorPoint, SenaRegimePosteriorPoint, SenaServiceContributor,
    SenaServiceDetail, SenaSkuDetail, SenaSkuSummary, SenaTrajectoryPoint, SenaWorkspaceSummary,
    SenaCatalog, SenaIntervalPosterior,
};
use anyhow::{anyhow, Result};
use rand::{rngs::StdRng, Rng, SeedableRng};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisArtifacts {
    pub primary_artifact_key: String,
    pub payload: serde_json::Value,
}

#[derive(Clone)]
struct NormalizedInterval<'a> {
    index: usize,
    start_at: String,
    end_at: String,
    delta_days: f64,
    stock_by_sku: HashMap<&'a str, f64>,
    service_ranks: HashMap<&'a str, usize>,
    retail_ranks: HashMap<&'a str, usize>,
    service_stockouts: Vec<&'a str>,
    retail_stockouts: Vec<&'a str>,
    order_signal_by_sku: HashMap<&'a str, (&'a crate::types::SenaOrderSignal, f64, f64)>,
    lead_time_hint_by_sku: HashMap<&'a str, &'a crate::types::SenaLeadTimeHint>,
}

#[derive(Clone)]
struct Particle {
    inventory: Vec<f64>,
    pipeline: Vec<f64>,
    service_rate: Vec<f64>,
    retail_rate: Vec<f64>,
    lead_time_mean: Vec<f64>,
    lead_time_std: Vec<f64>,
    age_days: Vec<f64>,
}

pub fn run_analysis(
    owner_sub: &str,
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    algorithm_version: &str,
) -> Result<(SenaAnalysisResult, AnalysisArtifacts)> {
    if observations.len() < 2 {
        return Err(anyhow!("SENA analysis requires at least two observations"));
    }
    let intervals = normalize_intervals(observations)?;
    let sku_count = catalog.skus.len();
    let service_count = catalog.services.len();
    let particle_count = if algorithm_version == "sena-analysis-v2" {
        192
    } else {
        128
    };
    let smoothing_enabled = algorithm_version == "sena-analysis-v2";
    let mut sku_index = HashMap::new();
    for (index, sku) in catalog.skus.iter().enumerate() {
        sku_index.insert(sku.sku_id.as_str(), index);
    }
    let mut service_index = HashMap::new();
    for (index, service) in catalog.services.iter().enumerate() {
        service_index.insert(service.service_id.as_str(), index);
    }
    let mut usage_map = vec![Vec::<(usize, f64)>::new(); service_count];
    for entry in &catalog.sharing_mask {
        if !entry.enabled {
            continue;
        }
        if let (Some(&service_idx), Some(&sku_idx)) = (
            service_index.get(entry.service_id.as_str()),
            sku_index.get(entry.sku_id.as_str()),
        ) {
            usage_map[service_idx].push((sku_idx, entry.usage_probability.unwrap_or(0.85)));
        }
    }
    let sku_capacity_hints = catalog
        .skus
        .iter()
        .map(|sku| {
            observations
                .iter()
                .flat_map(|observation| observation.input.stock_snapshot.iter())
                .filter(|entry| entry.sku_id == sku.sku_id)
                .map(|entry| entry.units_in_stock)
                .fold(0.0_f64, f64::max)
                .max(12.0)
        })
        .collect::<Vec<_>>();

    let mut particles = initialize_particles(catalog, observations, &sku_index, particle_count, owner_sub);
    let mut ess_values = Vec::new();
    let mut resampling_count = 0_usize;
    let mut regime_history = Vec::new();
    let mut sku_inventory_traces = vec![Vec::<SenaTrajectoryPoint>::new(); sku_count];
    let mut sku_interval_traces = vec![Vec::<SenaIntervalPosterior>::new(); sku_count];
    let mut sku_pipeline_traces = vec![Vec::<SenaPipelinePosteriorPoint>::new(); sku_count];
    let mut sku_lead_time_traces = vec![Vec::<SenaLeadTimePosteriorPoint>::new(); sku_count];
    let mut service_activity_acc = vec![Vec::<f64>::new(); service_count];
    let mut posterior_predictive_error_sum = 0.0;
    let mut covered_count = 0.0;

    for interval in &intervals {
        let mut rng =
            StdRng::seed_from_u64(stable_seed(&(owner_sub, interval.index, particle_count as u64)));
        let mut weights = Vec::with_capacity(particles.len());
        let mut next_particles = Vec::with_capacity(particles.len());
        let mut regime_votes = BTreeMap::new();
        for regime in ["normal", "spike", "lull", "stockout_constrained", "promo", "correction"] {
            regime_votes.insert(regime.to_string(), 0.0_f64);
        }
        let mut sku_service_demand_sum = vec![0.0_f64; sku_count];
        let mut sku_retail_demand_sum = vec![0.0_f64; sku_count];
        let mut sku_unconstrained_demand_sum = vec![0.0_f64; sku_count];
        let mut sku_realized_consumption_sum = vec![0.0_f64; sku_count];
        let mut sku_adjustments_sum = vec![0.0_f64; sku_count];
        let mut sku_receipts_sum = vec![0.0_f64; sku_count];
        let mut sku_order_probability_sum = vec![0.0_f64; sku_count];
        let mut sku_order_quantity_sum = vec![0.0_f64; sku_count];
        let mut sku_receipt_quantity_sum = vec![0.0_f64; sku_count];
        let mut sku_age_days_sum = vec![0.0_f64; sku_count];

        for particle in &particles {
            let mut next = particle.clone();
            let mut log_weight = 0.0;
            let mut dominant_regime = "normal";
            let mut particle_service_total = 0.0;
            let ranking_pressure = (interval.service_ranks.len() + interval.retail_ranks.len()) as f64;
            let stockout_pressure =
                (interval.service_stockouts.len() + interval.retail_stockouts.len()) as f64;
            let change_point_probability =
                (ranking_pressure * 0.03 + stockout_pressure * 0.08).clamp(0.01, 0.55);
            let seasonality_active = intervals.len() >= 6;

            for (service_idx, service) in catalog.services.iter().enumerate() {
                let rank_bonus = interval
                    .service_ranks
                    .get(service.service_id.as_str())
                    .map(|position| ((10_usize.saturating_sub(*position)) as f64) * 0.035)
                    .unwrap_or(0.0);
                let stockout_penalty = if interval
                    .service_stockouts
                    .iter()
                    .any(|value| *value == service.service_id.as_str())
                {
                    0.25
                } else {
                    0.0
                };
                let promo_bonus = if service.bundle { 0.09 } else { 0.0 };
                let drift = sample_normal(&mut rng) * if change_point_probability > 0.2 { 0.28 } else { 0.12 };
                let seasonal = if seasonality_active {
                    ((interval.index % 7) as f64 / 7.0) * 0.08
                } else {
                    0.0
                };
                next.service_rate[service_idx] =
                    (next.service_rate[service_idx] + drift + rank_bonus + promo_bonus + seasonal
                        - stockout_penalty)
                        .clamp(-6.0, 2.4);
                let expected = next.service_rate[service_idx].exp() * interval.delta_days.max(0.5);
                let realized = sample_positive(&mut rng, expected, 0.35);
                particle_service_total += realized;
                service_activity_acc[service_idx].push(realized);
                if realized > expected * 1.25 {
                    dominant_regime = "spike";
                }
                if stockout_penalty > 0.0 && realized > expected * 0.8 {
                    dominant_regime = "stockout_constrained";
                }
                if promo_bonus > 0.0 && rank_bonus > 0.0 {
                    dominant_regime = "promo";
                }
                for (sku_idx, usage_probability) in &usage_map[service_idx] {
                    let usage = realized
                        * usage_probability
                        * (0.6 + 0.4 * rng.gen::<f64>())
                        * interval.delta_days.min(2.0);
                    next.inventory[*sku_idx] = (next.inventory[*sku_idx] - usage.max(0.0)).max(0.0);
                }
            }

            for (sku_idx, sku) in catalog.skus.iter().enumerate() {
                let capacity_hint = sku_capacity_hints[sku_idx];
                let retail_rank_bonus = interval
                    .retail_ranks
                    .get(sku.sku_id.as_str())
                    .map(|position| ((10_usize.saturating_sub(*position)) as f64) * 0.05)
                    .unwrap_or(0.0);
                let drift = sample_normal(&mut rng) * 0.10;
                next.retail_rate[sku_idx] =
                    (next.retail_rate[sku_idx] + drift + retail_rank_bonus).clamp(-7.0, 2.2);
                let retail_demand = if sku.sold_as_product {
                    sample_positive(&mut rng, next.retail_rate[sku_idx].exp() * interval.delta_days, 0.25)
                        .min(capacity_hint * 0.45)
                } else {
                    0.0
                };

                let expected_lead_time_demand =
                    (next.service_rate.iter().map(|value| value.exp()).sum::<f64>() / service_count.max(1) as f64
                        + retail_demand)
                        * next.lead_time_mean[sku_idx].max(1.0);
                let expected_lead_time_demand = expected_lead_time_demand.min(capacity_hint * 2.5);
                let reorder_point = expected_lead_time_demand
                    + 1.64 * (expected_lead_time_demand.sqrt() + next.lead_time_std[sku_idx]);
                let reorder_point = reorder_point.min(capacity_hint * 3.2);

                let signal = interval.order_signal_by_sku.get(sku.sku_id.as_str());
                let order_probability: f64 =
                    if next.inventory[sku_idx] + next.pipeline[sku_idx] < reorder_point {
                    0.7
                } else {
                    0.12
                } + signal
                        .map(|(entry, _, _)| if entry.order_placed { 0.22 } else { 0.0 })
                        .unwrap_or(0.0);
                let order_happened = rng.gen::<f64>() < order_probability.clamp(0.02, 0.95);
                let order_quantity = if order_happened {
                    signal
                        .and_then(|(_, approx, _)| if *approx > 0.0 { Some(*approx) } else { None })
                        .unwrap_or_else(|| sample_positive(&mut rng, reorder_point.max(1.0), 0.20))
                        .min(capacity_hint * 1.8)
                } else {
                    0.0
                };
                next.age_days[sku_idx] = if order_happened {
                    0.0
                } else {
                    next.age_days[sku_idx] + interval.delta_days
                };
                next.pipeline[sku_idx] = (next.pipeline[sku_idx] + order_quantity).min(capacity_hint * 4.0);

                if let Some(hint) = interval.lead_time_hint_by_sku.get(sku.sku_id.as_str()) {
                    if let Some(typical_days) = hint.typical_days {
                        let log_target = typical_days.max(0.5).ln();
                        next.lead_time_mean[sku_idx] =
                            (0.7 * next.lead_time_mean[sku_idx].ln() + 0.3 * log_target).exp();
                    }
                    if let (Some(low), Some(high)) = (hint.low_days, hint.high_days) {
                        next.lead_time_std[sku_idx] =
                            (((high - low).abs() / 4.0).max(0.3) + next.lead_time_std[sku_idx]) / 2.0;
                    }
                } else {
                    next.lead_time_mean[sku_idx] =
                        (next.lead_time_mean[sku_idx].ln() + sample_normal(&mut rng) * 0.05).exp();
                    next.lead_time_std[sku_idx] =
                        (next.lead_time_std[sku_idx].ln() + sample_normal(&mut rng) * 0.03).exp();
                }
                next.lead_time_mean[sku_idx] = next.lead_time_mean[sku_idx].clamp(1.0, 21.0);
                next.lead_time_std[sku_idx] = next.lead_time_std[sku_idx].clamp(0.3, 7.0);

                let receipt_quantity = signal
                    .and_then(|(entry, _, approx_receipt)| {
                        if entry.receipt_arrived {
                            Some((*approx_receipt).max(order_quantity * 0.5).max(1.0))
                        } else {
                            None
                        }
                    })
                    .unwrap_or_else(|| {
                        if next.pipeline[sku_idx] > 0.0 && next.age_days[sku_idx] >= next.lead_time_mean[sku_idx] {
                            (next.pipeline[sku_idx] * (0.45 + 0.25 * rng.gen::<f64>())).min(next.pipeline[sku_idx])
                        } else {
                            0.0
                        }
                    });
                next.pipeline[sku_idx] = (next.pipeline[sku_idx] - receipt_quantity).max(0.0);

                let unconstrained = retail_demand;
                let available = next.inventory[sku_idx] + receipt_quantity;
                let realized_consumption = unconstrained.min(available.max(0.0));
                let adjustment = signal
                    .map(|(_, approx, receipt)| (receipt - approx) * 0.1)
                    .unwrap_or(0.0);
                next.inventory[sku_idx] =
                    (available - realized_consumption + adjustment).max(0.0);

                let observed = *interval.stock_by_sku.get(sku.sku_id.as_str()).unwrap_or(&next.inventory[sku_idx]);
                let residual = observed - next.inventory[sku_idx];
                let sigma = observed.max(1.0).sqrt() * 0.18 + 1.1;
                posterior_predictive_error_sum += residual.abs();
                if (observed >= next.inventory[sku_idx] - 2.0 * sigma)
                    && (observed <= next.inventory[sku_idx] + 2.0 * sigma)
                {
                    covered_count += 1.0;
                }
                log_weight += -0.5 * (residual / sigma).powi(2);
                if interval
                    .retail_stockouts
                    .iter()
                    .any(|value| *value == sku.sku_id.as_str())
                    && next.inventory[sku_idx] > reorder_point
                {
                    log_weight -= 0.4;
                }

                sku_service_demand_sum[sku_idx] +=
                    particle_service_total / service_count.max(1) as f64;
                sku_retail_demand_sum[sku_idx] += retail_demand;
                sku_unconstrained_demand_sum[sku_idx] += unconstrained;
                sku_realized_consumption_sum[sku_idx] += realized_consumption;
                sku_adjustments_sum[sku_idx] += adjustment;
                sku_receipts_sum[sku_idx] += receipt_quantity;
                sku_order_probability_sum[sku_idx] += order_probability.clamp(0.0, 1.0);
                sku_order_quantity_sum[sku_idx] += order_quantity;
                sku_receipt_quantity_sum[sku_idx] += receipt_quantity;
                sku_age_days_sum[sku_idx] += next.age_days[sku_idx];
            }

            *regime_votes.entry(dominant_regime.to_string()).or_default() += 1.0;
            weights.push(log_weight.exp().clamp(1e-12, 1e12));
            next_particles.push(next);
        }

        let (resampled, ess, resampled_any) = resample(next_particles, weights, &mut rng);
        if resampled_any {
            resampling_count += 1;
        }
        ess_values.push(ess);
        particles = resampled;
        for (sku_idx, _sku) in catalog.skus.iter().enumerate() {
            let inventory_samples = particles
                .iter()
                .map(|particle| particle.inventory[sku_idx])
                .collect::<Vec<_>>();
            let pipeline_samples = particles
                .iter()
                .map(|particle| particle.pipeline[sku_idx])
                .collect::<Vec<_>>();
            let lead_time_mean_samples = particles
                .iter()
                .map(|particle| particle.lead_time_mean[sku_idx])
                .collect::<Vec<_>>();
            let lead_time_std_samples = particles
                .iter()
                .map(|particle| particle.lead_time_std[sku_idx])
                .collect::<Vec<_>>();
            let particle_denominator = particles.len().max(1) as f64;

            sku_inventory_traces[sku_idx].push(SenaTrajectoryPoint {
                at: interval.end_at.clone(),
                mean: mean(&inventory_samples),
                low: quantile(&inventory_samples, 0.1),
                high: quantile(&inventory_samples, 0.9),
            });
            sku_interval_traces[sku_idx].push(SenaIntervalPosterior {
                interval_index: interval.index,
                start_at: interval.start_at.clone(),
                end_at: interval.end_at.clone(),
                delta_days: interval.delta_days,
                service_demand_mean: sku_service_demand_sum[sku_idx] / particle_denominator,
                retail_demand_mean: sku_retail_demand_sum[sku_idx] / particle_denominator,
                unconstrained_demand_mean: sku_unconstrained_demand_sum[sku_idx] / particle_denominator,
                realized_consumption_mean: sku_realized_consumption_sum[sku_idx] / particle_denominator,
                adjustments_mean: sku_adjustments_sum[sku_idx] / particle_denominator,
                receipts_mean: sku_receipts_sum[sku_idx] / particle_denominator,
            });
            sku_pipeline_traces[sku_idx].push(SenaPipelinePosteriorPoint {
                interval_index: interval.index,
                in_transit_mean: mean(&pipeline_samples),
                order_probability: sku_order_probability_sum[sku_idx] / particle_denominator,
                order_quantity_mean: sku_order_quantity_sum[sku_idx] / particle_denominator,
                receipt_quantity_mean: sku_receipt_quantity_sum[sku_idx] / particle_denominator,
                age_days_mean: sku_age_days_sum[sku_idx] / particle_denominator,
            });
            sku_lead_time_traces[sku_idx].push(SenaLeadTimePosteriorPoint {
                interval_index: interval.index,
                log_mean_days: mean(
                    &lead_time_mean_samples
                        .iter()
                        .map(|value| value.ln())
                        .collect::<Vec<_>>(),
                ),
                log_std_days: mean(
                    &lead_time_std_samples
                        .iter()
                        .map(|value| value.ln())
                        .collect::<Vec<_>>(),
                ),
                mean_days: mean(&lead_time_mean_samples),
                std_days: mean(&lead_time_std_samples),
            });
        }
        let total_votes = regime_votes.values().sum::<f64>().max(1.0);
        for value in regime_votes.values_mut() {
            *value /= total_votes;
        }
        let dominant_regime = regime_votes
            .iter()
            .max_by(|left, right| left.1.partial_cmp(right.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(key, _)| key.clone())
            .unwrap_or_else(|| "normal".to_string());
        regime_history.push(SenaRegimePosteriorPoint {
            interval_index: interval.index,
            start_at: interval.start_at.clone(),
            end_at: interval.end_at.clone(),
            dominant_regime,
            regime_probabilities: regime_votes,
        });
    }

    if smoothing_enabled {
        smooth_inventory_traces(&mut sku_inventory_traces);
    }

    let latest_observed_at = observations.last().map(|value| value.input.observed_at.clone());
    let mut sku_summaries = Vec::new();
    let mut sku_details = Vec::new();
    for (sku_idx, sku) in catalog.skus.iter().enumerate() {
        let inventory_trace = &sku_inventory_traces[sku_idx];
        let latest_inventory = inventory_trace.last().map(|point| point.mean).unwrap_or(0.0);
        let demand_trace = &sku_interval_traces[sku_idx];
        let lead_time_trace = &sku_lead_time_traces[sku_idx];
        let pipeline_trace = &sku_pipeline_traces[sku_idx];
        let demand_per_day_mean = mean(
            &demand_trace
                .iter()
                .map(|value| value.realized_consumption_mean / value.delta_days.max(1.0))
                .collect::<Vec<_>>(),
        );
        let lead_time_mean_days = mean(
            &lead_time_trace
                .iter()
                .map(|value| value.mean_days)
                .collect::<Vec<_>>(),
        )
        .max(1.0);
        let lead_time_std_days = mean(
            &lead_time_trace
                .iter()
                .map(|value| value.std_days)
                .collect::<Vec<_>>(),
        )
        .max(0.3);
        let expected_lead_time_demand = demand_per_day_mean * lead_time_mean_days;
        let safety_stock = 1.64
            * ((demand_per_day_mean.max(0.1) * lead_time_std_days.powi(2))
                + lead_time_mean_days.powi(2) * demand_per_day_mean.max(0.1))
            .sqrt();
        let reorder_point = expected_lead_time_demand + safety_stock;
        let stockout_risk = if reorder_point <= 0.0 {
            0.0
        } else {
            (reorder_point - latest_inventory).max(0.0) / reorder_point.max(1.0)
        }
        .clamp(0.0, 1.0);
        let days_of_cover = if demand_per_day_mean > 0.0 {
            Some(latest_inventory / demand_per_day_mean.max(0.1))
        } else {
            None
        };
        let reorder_trigger_probability = (stockout_risk + if latest_inventory <= reorder_point { 0.25 } else { 0.0 })
            .clamp(0.0, 1.0);
        let regime_probabilities = regime_history
            .last()
            .map(|entry| entry.regime_probabilities.clone())
            .unwrap_or_default();

        let summary = SenaSkuSummary {
            sku_id: sku.sku_id.clone(),
            latest_posterior_units: latest_inventory,
            credible_interval_low: inventory_trace.last().map(|point| point.low).unwrap_or(0.0),
            credible_interval_high: inventory_trace.last().map(|point| point.high).unwrap_or(0.0),
            demand_per_day_mean,
            stockout_risk,
            days_of_cover,
            expected_lead_time_demand,
            safety_stock,
            reorder_point,
            reorder_trigger_probability,
            lead_time_mean_days,
            lead_time_std_days,
            regime_probabilities,
        };
        sku_details.push(SenaSkuDetail {
            summary: summary.clone(),
            inventory_posterior: inventory_trace.clone(),
            demand_posterior: demand_trace.clone(),
            pipeline_posterior: pipeline_trace.clone(),
            lead_time_posterior: lead_time_trace.clone(),
        });
        sku_summaries.push(summary);
    }

    sku_summaries.sort_by(|left, right| {
        right
            .stockout_risk
            .partial_cmp(&left.stockout_risk)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let pending_reorder_count = sku_summaries
        .iter()
        .filter(|summary| summary.reorder_trigger_probability >= 0.5)
        .count();
    let high_risk_sku_ids = sku_summaries
        .iter()
        .filter(|summary| summary.stockout_risk >= 0.35)
        .take(5)
        .map(|summary| summary.sku_id.clone())
        .collect::<Vec<_>>();
    let top_regime = regime_history
        .last()
        .map(|value| value.dominant_regime.clone())
        .unwrap_or_else(|| "normal".to_string());

    let mut service_details = Vec::new();
    for (service_idx, service) in catalog.services.iter().enumerate() {
        let contributors = usage_map[service_idx]
            .iter()
            .map(|(sku_idx, probability)| SenaServiceContributor {
                sku_id: catalog.skus[*sku_idx].sku_id.clone(),
                usage_probability: *probability,
                bottleneck_probability: sku_summaries
                    .iter()
                    .find(|summary| summary.sku_id == catalog.skus[*sku_idx].sku_id)
                    .map(|summary| summary.stockout_risk)
                    .unwrap_or(0.0),
            })
            .collect::<Vec<_>>();
        let activity = &service_activity_acc[service_idx];
        service_details.push(SenaServiceDetail {
            service_id: service.service_id.clone(),
            activity_mean: mean(activity),
            activity_interval_low: quantile(activity, 0.1),
            activity_interval_high: quantile(activity, 0.9),
            bottleneck_probability: mean(
                &contributors
                    .iter()
                    .map(|value| value.bottleneck_probability)
                    .collect::<Vec<_>>(),
            ),
            contributors,
            regime_timeline: regime_history.clone(),
        });
    }

    let diagnostic_denominator =
        (intervals.len().max(1) * sku_count.max(1) * particle_count.max(1)) as f64;
    let diagnostics = SenaDiagnostics {
        effective_sample_size_mean: mean(&ess_values),
        resampling_count,
        smoothing_enabled,
        change_point_probability: regime_history
            .last()
            .and_then(|entry| entry.regime_probabilities.get("correction"))
            .copied()
            .unwrap_or(0.0),
        seasonality_active: intervals.len() >= 6,
        posterior_predictive_error_mean: posterior_predictive_error_sum / diagnostic_denominator,
        coverage_estimate: (covered_count / diagnostic_denominator).clamp(0.0, 1.0),
        regime_history: regime_history.clone(),
    };

    let workspace_summary = SenaWorkspaceSummary {
        owner_sub: owner_sub.to_string(),
        run_id: String::new(),
        latest_observed_at,
        sku_count: catalog.skus.len(),
        service_count: catalog.services.len(),
        interval_count: intervals.len(),
        pending_reorder_count,
        top_regime,
        high_risk_sku_ids,
        sku_summaries,
    };
    let result = SenaAnalysisResult {
        workspace_summary,
        sku_details,
        service_details,
        diagnostics,
    };
    let artifacts = AnalysisArtifacts {
        primary_artifact_key: format!("sena-analysis/{owner_sub}/{algorithm_version}/posterior-draws"),
        payload: serde_json::json!({
            "generatedAt": OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string()),
            "algorithmVersion": algorithm_version,
            "skuDetails": result.sku_details,
            "serviceDetails": result.service_details,
            "diagnostics": result.diagnostics
        }),
    };
    Ok((result, artifacts))
}

fn normalize_intervals<'a>(observations: &'a [SenaObservationRecord]) -> Result<Vec<NormalizedInterval<'a>>> {
    let mut intervals = Vec::new();
    for (index, pair) in observations.windows(2).enumerate() {
        let start_at = OffsetDateTime::parse(&pair[0].input.observed_at, &Rfc3339)
            .map_err(|err| anyhow!("invalid observation timestamp: {err}"))?;
        let end_at = OffsetDateTime::parse(&pair[1].input.observed_at, &Rfc3339)
            .map_err(|err| anyhow!("invalid observation timestamp: {err}"))?;
        let delta_days = ((end_at - start_at).whole_seconds().max(86_400) as f64) / 86_400.0;
        intervals.push(NormalizedInterval {
            index: index + 1,
            start_at: pair[0].input.observed_at.clone(),
            end_at: pair[1].input.observed_at.clone(),
            delta_days,
            stock_by_sku: pair[1]
                .input
                .stock_snapshot
                .iter()
                .map(|entry| (entry.sku_id.as_str(), entry.units_in_stock))
                .collect(),
            service_ranks: pair[1]
                .input
                .service_rankings
                .iter()
                .enumerate()
                .map(|(position, value)| (value.as_str(), position))
                .collect(),
            retail_ranks: pair[1]
                .input
                .retail_rankings
                .iter()
                .enumerate()
                .map(|(position, value)| (value.as_str(), position))
                .collect(),
            service_stockouts: pair[1]
                .input
                .service_stockouts
                .iter()
                .map(String::as_str)
                .collect(),
            retail_stockouts: pair[1]
                .input
                .retail_stockouts
                .iter()
                .map(String::as_str)
                .collect(),
            order_signal_by_sku: pair[1]
                .input
                .order_signals
                .iter()
                .map(|entry| {
                    (
                        entry.sku_id.as_str(),
                        (
                            entry,
                            entry.approximate_order_quantity.unwrap_or(0.0),
                            entry.approximate_receipt_quantity.unwrap_or(0.0),
                        ),
                    )
                })
                .collect(),
            lead_time_hint_by_sku: pair[1]
                .input
                .lead_time_hints
                .iter()
                .map(|entry| (entry.sku_id.as_str(), entry))
                .collect(),
        });
    }
    Ok(intervals)
}

fn initialize_particles(
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    sku_index: &HashMap<&str, usize>,
    particle_count: usize,
    owner_sub: &str,
) -> Vec<Particle> {
    let mut initial_inventory = vec![0.0; catalog.skus.len()];
    for snapshot in &observations[0].input.stock_snapshot {
        if let Some(index) = sku_index.get(snapshot.sku_id.as_str()) {
            initial_inventory[*index] = snapshot.units_in_stock.max(0.0);
        }
    }
    (0..particle_count)
        .map(|particle_index| {
            let mut rng = StdRng::seed_from_u64(stable_seed(&(owner_sub, "init", particle_index as u64)));
            Particle {
                inventory: initial_inventory
                    .iter()
                    .map(|value| (value + sample_normal(&mut rng) * (value.sqrt() * 0.08 + 0.5)).max(0.0))
                    .collect(),
                pipeline: vec![0.0; catalog.skus.len()],
                service_rate: vec![0.1; catalog.services.len()],
                retail_rate: catalog
                    .skus
                    .iter()
                    .map(|sku| if sku.sold_as_product { 0.08 } else { -6.0 })
                    .collect(),
                lead_time_mean: catalog
                    .skus
                    .iter()
                    .map(|sku| sku.lead_time_mean_days_hint.unwrap_or(7.0).max(0.5))
                    .collect(),
                lead_time_std: catalog
                    .skus
                    .iter()
                    .map(|sku| sku.lead_time_std_days_hint.unwrap_or(2.0).max(0.3))
                    .collect(),
                age_days: vec![0.0; catalog.skus.len()],
            }
        })
        .collect()
}

fn resample(particles: Vec<Particle>, weights: Vec<f64>, rng: &mut StdRng) -> (Vec<Particle>, f64, bool) {
    let total = weights.iter().sum::<f64>().max(1e-12);
    let normalized = weights.iter().map(|weight| weight / total).collect::<Vec<_>>();
    let ess = 1.0 / normalized.iter().map(|weight| weight.powi(2)).sum::<f64>().max(1e-12);
    let should_resample = ess < particles.len() as f64 * 0.7;
    if !should_resample {
        return (particles, ess, false);
    }
    let mut cumulative = Vec::with_capacity(normalized.len());
    let mut running = 0.0;
    for weight in normalized {
        running += weight;
        cumulative.push(running);
    }
    let mut resampled = Vec::with_capacity(particles.len());
    for _ in 0..particles.len() {
        let draw = rng.gen::<f64>();
        let index = cumulative
            .iter()
            .position(|threshold| *threshold >= draw)
            .unwrap_or(cumulative.len().saturating_sub(1));
        resampled.push(particles[index].clone());
    }
    (resampled, ess, true)
}

fn smooth_inventory_traces(traces: &mut [Vec<SenaTrajectoryPoint>]) {
    for trace in traces {
        if trace.len() < 3 {
            continue;
        }
        for index in (1..trace.len() - 1).rev() {
            trace[index].mean = (trace[index - 1].mean + trace[index].mean + trace[index + 1].mean) / 3.0;
            trace[index].low = (trace[index - 1].low + trace[index].low + trace[index + 1].low) / 3.0;
            trace[index].high =
                (trace[index - 1].high + trace[index].high + trace[index + 1].high) / 3.0;
        }
    }
}

fn sample_positive(rng: &mut StdRng, mean: f64, scale: f64) -> f64 {
    (mean + sample_normal(rng) * (mean.abs().sqrt() * scale + 0.1)).max(0.0)
}

fn sample_normal(rng: &mut StdRng) -> f64 {
    let u1 = rng.gen::<f64>().clamp(f64::MIN_POSITIVE, 1.0);
    let u2 = rng.gen::<f64>();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn quantile(values: &[f64], q: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let index = ((sorted.len() - 1) as f64 * q.clamp(0.0, 1.0)).round() as usize;
    sorted[index]
}

fn stable_seed(value: &impl std::fmt::Debug) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    format!("{value:?}").hash(&mut hasher);
    hasher.finish()
}
