use super::{
    cmp_f64, confidence_for_report_count, demand_hint_for_sku, infer_lead_time, mean,
    parse_report_time, quantile, sample_standard_normal, stable_seed, DesktopServiceRecord,
    DesktopSkuRecord, OwnerInventory,
};
use crate::types::{
    SistAnalysisMetadata, SistAnalysisState, SistAnalysisStatus, SistConfidence,
    SistDisruptionWindow, SistDriftDiagnostics, SistIntervalDemandBreakdown,
    SistModelHealthSummary, SistOverview, SistRegime, SistRegimePosteriorPoint,
    SistReorderPolicyBreakdown, SistReportEvidenceSummary, SistRiskEntity, SistServiceContributor,
    SistServiceDetailResponse, SistSettings, SistSignalIntakeSummary, SistSkuDetailResponse,
    SistSkuInsight, SistSystemDetailResponse, SistTrajectoryPoint, StockReportRecord,
};
use rand::{rngs::StdRng, Rng, SeedableRng};
use std::collections::{BTreeMap, HashMap, HashSet};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub(super) struct ComputedSistAnalysis {
    pub overview: SistOverview,
    pub sku_details: BTreeMap<String, SistSkuDetailResponse>,
    pub service_details: BTreeMap<String, SistServiceDetailResponse>,
    pub system_detail: SistSystemDetailResponse,
}

#[derive(Clone)]
struct ModelInterval {
    index: usize,
    start_at: String,
    end_at: String,
    duration_days: f64,
    end_report: StockReportRecord,
    sku_observations: HashMap<String, IntervalSkuObservation>,
    service_stockouts: HashSet<String>,
    service_price_adjustments: HashMap<String, f64>,
    service_ranking_positions: HashMap<String, usize>,
    retail_ranking_positions: HashMap<String, usize>,
    notes_present: bool,
}

#[derive(Clone, Copy)]
struct IntervalSkuObservation {
    previous_units: f64,
    observed_units: f64,
    restock_included: bool,
    retail_stockout: bool,
}

#[derive(Clone)]
struct Particle {
    inventory: Vec<f64>,
    service_log_intensity: Vec<f64>,
    retail_log_intensity: Vec<f64>,
}

#[derive(Clone)]
struct ParticleIntervalState {
    inventory: Vec<f64>,
    service_demand: Vec<f64>,
    retail_demand: Vec<f64>,
    restock: Vec<f64>,
    correction: Vec<f64>,
    service_activity: Vec<f64>,
    regime: SistRegime,
}

#[derive(Default)]
struct SkuSummaryAccumulator {
    posterior_inventory_trajectory: Vec<SistTrajectoryPoint>,
    forecast_trajectory: Vec<SistTrajectoryPoint>,
    interval_demand: Vec<SistIntervalDemandBreakdown>,
    evidence_summary: Vec<SistReportEvidenceSummary>,
}

#[derive(Default)]
struct ServiceAccumulator {
    activity_by_interval: Vec<f64>,
    evidence_timeline: Vec<SistReportEvidenceSummary>,
}

pub(super) fn compute_sist_analysis(
    owner_sub: &str,
    owner: &OwnerInventory,
) -> ComputedSistAnalysis {
    let intervals = build_intervals(owner);
    let report_count = owner.sist.stock_reports.len();
    let confidence = confidence_for_report_count(report_count);
    let particle_count = (owner.sist.settings.particle_count / 4).clamp(64, 256);
    let effective_smoothing_window = owner
        .sist
        .settings
        .smoothing_window_reports
        .min(report_count.max(1));
    let analysis_timestamp = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| {
            owner
                .sist
                .stock_reports
                .last()
                .map(|r| r.reported_at.clone())
                .unwrap_or_default()
        });
    let seasonality_active = intervals.len() >= 6;
    let weekday_effects = weekday_effects(&intervals, seasonality_active);

    let mut sku_index = HashMap::new();
    for (index, sku) in owner.catalog.skus.iter().enumerate() {
        sku_index.insert(sku.sku_id.clone(), index);
    }
    let mut service_index = HashMap::new();
    for (index, service) in owner.catalog.services.iter().enumerate() {
        service_index.insert(service.service_id.clone(), index);
    }
    let service_links = owner
        .catalog
        .services
        .iter()
        .map(|service| {
            service
                .sku_ids
                .iter()
                .filter_map(|sku_id| sku_index.get(sku_id).copied())
                .collect::<Vec<_>>()
        })
        .collect::<Vec<_>>();

    let mut particles = initialize_particles(owner, &sku_index, particle_count, owner_sub);
    let mut ess_values = Vec::new();
    let mut regime_history = Vec::new();
    let mut sku_accumulators = owner
        .catalog
        .skus
        .iter()
        .map(|sku| (sku.sku_id.clone(), SkuSummaryAccumulator::default()))
        .collect::<BTreeMap<_, _>>();
    let mut service_accumulators = owner
        .catalog
        .services
        .iter()
        .map(|service| (service.service_id.clone(), ServiceAccumulator::default()))
        .collect::<BTreeMap<_, _>>();
    let mut signal_intake = SistSignalIntakeSummary {
        ranking_observations: 0,
        restock_flags: 0,
        stockout_flags: 0,
        price_adjustments: 0,
        correction_signals: 0,
    };
    let mut recent_change_point_probability = 0.0;

    for interval in &intervals {
        signal_intake.ranking_observations +=
            interval.service_ranking_positions.len() + interval.retail_ranking_positions.len();
        signal_intake.restock_flags += interval
            .sku_observations
            .values()
            .filter(|observation| observation.restock_included)
            .count();
        signal_intake.stockout_flags += interval.service_stockouts.len()
            + interval
                .sku_observations
                .values()
                .filter(|observation| observation.retail_stockout)
                .count();
        signal_intake.price_adjustments += interval.service_price_adjustments.len();

        let regime_probabilities = regime_probabilities(interval);
        let change_point_probability = regime_change_point_probability(interval);
        recent_change_point_probability = change_point_probability;

        let mut rng =
            StdRng::seed_from_u64(stable_seed(&(owner_sub, interval.index, particle_count)));
        let mut weights = Vec::with_capacity(particles.len());
        let mut interval_states = Vec::with_capacity(particles.len());
        let mut evolved_particles = Vec::with_capacity(particles.len());
        for particle in &particles {
            let (next_particle, interval_state, log_likelihood) = evolve_particle(
                particle,
                interval,
                owner,
                &service_links,
                &sku_index,
                &service_index,
                &weekday_effects,
                &regime_probabilities,
                change_point_probability,
                &mut rng,
            );
            evolved_particles.push(next_particle);
            interval_states.push(interval_state);
            weights.push(log_likelihood.exp().clamp(1e-12, 1e12));
        }
        let (resampled_particles, resampled_states, ess) =
            resample_particles(evolved_particles, interval_states, weights, &mut rng);
        particles = resampled_particles;
        ess_values.push(ess);

        let interval_regime_probs = regime_probabilities_from_states(&resampled_states);
        let dominant_regime = dominant_regime(&interval_regime_probs);
        regime_history.push(SistRegimePosteriorPoint {
            interval_index: interval.index,
            start_at: interval.start_at.clone(),
            end_at: interval.end_at.clone(),
            dominant_regime,
            change_point_probability,
            regime_probabilities: interval_regime_probs
                .iter()
                .map(|(regime, probability)| (regime_key(*regime).to_string(), *probability))
                .collect(),
        });

        summarize_interval(
            interval,
            &resampled_states,
            owner,
            &service_links,
            &mut sku_accumulators,
            &mut service_accumulators,
            &mut signal_intake,
            dominant_regime,
        );
    }

    let metadata = SistAnalysisMetadata {
        report_count_used: report_count,
        effective_smoothing_window_used: effective_smoothing_window,
        analysis_timestamp: analysis_timestamp.clone(),
        seasonality_active,
        change_point_active: recent_change_point_probability > 0.15 || intervals.len() >= 4,
    };

    let final_state = finalize_state(owner, &particles, &regime_history, &metadata, confidence);
    let forecast = forecast_system(
        owner,
        &particles,
        &service_links,
        &sku_index,
        &service_index,
        owner.sist.settings.forecast_horizon_days,
        owner_sub,
    );

    for sku in &owner.catalog.skus {
        if let Some(accumulator) = sku_accumulators.get_mut(&sku.sku_id) {
            accumulator.forecast_trajectory = forecast
                .sku_forecasts
                .get(&sku.sku_id)
                .cloned()
                .unwrap_or_default();
        }
    }

    let mut sku_details = BTreeMap::new();
    let mut sku_insights = Vec::new();
    for sku in &owner.catalog.skus {
        let insight = build_sku_insight(
            sku,
            owner,
            &particles,
            regime_history.last(),
            confidence,
            &owner.sist.settings,
        );
        let accumulator = sku_accumulators.remove(&sku.sku_id).unwrap_or_default();
        sku_details.insert(
            sku.sku_id.clone(),
            SistSkuDetailResponse {
                insight: insight.clone(),
                reports: owner
                    .sist
                    .stock_reports
                    .iter()
                    .filter(|report| {
                        report
                            .sku_observations
                            .iter()
                            .any(|observation| observation.sku_id == sku.sku_id)
                    })
                    .cloned()
                    .collect(),
                posterior_inventory_trajectory: accumulator.posterior_inventory_trajectory,
                forecast_trajectory: accumulator.forecast_trajectory,
                interval_demand: accumulator.interval_demand,
                regime_timeline: regime_history.clone(),
                evidence_summary: accumulator.evidence_summary,
                reorder_policy: Some(SistReorderPolicyBreakdown {
                    target_service_level: owner.sist.settings.target_service_level,
                    lead_time_days_mean: insight.lead_time.mean_days,
                    lead_time_days_std: insight.lead_time.std_days,
                    expected_lead_time_demand: insight.expected_demand_per_day
                        * insight.lead_time.mean_days,
                    reorder_point: insight.reorder_point,
                    safety_stock: insight.safety_stock,
                    reorder_trigger_probability: insight.reorder_trigger_probability,
                }),
                metadata: Some(metadata.clone()),
            },
        );
        sku_insights.push(insight);
    }

    sku_insights.sort_by(|left, right| {
        right
            .stockout_risk
            .partial_cmp(&left.stockout_risk)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let pending_reorder_count = sku_insights
        .iter()
        .filter(|insight| {
            insight.reorder_trigger_probability >= 0.5
                || insight.latest_posterior_units <= insight.reorder_point
        })
        .count();
    let high_risk_sku_ids = sku_insights
        .iter()
        .filter(|insight| insight.stockout_risk >= 0.4)
        .take(3)
        .map(|insight| insight.sku_id.clone())
        .collect::<Vec<_>>();
    let top_regime = regime_history.last().map(|entry| entry.dominant_regime);

    let mut service_details = BTreeMap::new();
    let mut top_risky_entities = sku_insights
        .iter()
        .take(3)
        .map(|insight| SistRiskEntity {
            entity_type: "sku".to_string(),
            entity_id: insight.sku_id.clone(),
            risk_score: insight.stockout_risk,
        })
        .collect::<Vec<_>>();
    for service in &owner.catalog.services {
        let accumulator = service_accumulators
            .remove(&service.service_id)
            .unwrap_or_default();
        let detail = build_service_detail(
            service,
            owner,
            &sku_insights,
            &forecast,
            accumulator,
            &regime_history,
            &metadata,
        );
        top_risky_entities.push(SistRiskEntity {
            entity_type: "service".to_string(),
            entity_id: service.service_id.clone(),
            risk_score: detail.bottleneck_probability,
        });
        service_details.insert(service.service_id.clone(), detail);
    }
    top_risky_entities.sort_by(|left, right| {
        right
            .risk_score
            .partial_cmp(&left.risk_score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    top_risky_entities.truncate(6);

    let overview = SistOverview {
        status: final_state.status,
        settings: owner.sist.settings.clone(),
        as_of: owner
            .sist
            .stock_reports
            .last()
            .map(|report| report.reported_at.clone()),
        top_regime,
        pending_reorder_count,
        high_risk_sku_ids,
        sku_insights,
        metadata: Some(metadata.clone()),
    };

    let system_detail = SistSystemDetailResponse {
        interval_timeline: final_state.interval_timeline,
        regime_posterior_history: regime_history,
        signal_intake,
        model_health: SistModelHealthSummary {
            particle_count_used: particle_count,
            interval_count: intervals.len(),
            effective_sample_size_mean: mean(&ess_values),
            confidence,
        },
        top_risky_entities,
        drift_diagnostics: SistDriftDiagnostics {
            seasonality_active,
            change_point_active: metadata.change_point_active,
            recent_change_point_probability,
            service_drift_scale: (1.5 / effective_smoothing_window.max(1) as f64)
                .sqrt()
                .max(0.08),
            retail_drift_scale: (2.0 / effective_smoothing_window.max(1) as f64)
                .sqrt()
                .max(0.1),
        },
        metadata: Some(metadata),
    };

    ComputedSistAnalysis {
        overview,
        sku_details,
        service_details,
        system_detail,
    }
}

struct FinalAnalysisState {
    status: SistAnalysisStatus,
    interval_timeline: Vec<SistIntervalDemandBreakdown>,
}

struct ForecastOutputs {
    sku_forecasts: BTreeMap<String, Vec<SistTrajectoryPoint>>,
}

fn finalize_state(
    owner: &OwnerInventory,
    particles: &[Particle],
    interval_history: &[SistRegimePosteriorPoint],
    metadata: &SistAnalysisMetadata,
    confidence: SistConfidence,
) -> FinalAnalysisState {
    let mut interval_timeline = Vec::new();
    if let Some(last_report) = owner.sist.stock_reports.last() {
        for regime in interval_history {
            interval_timeline.push(SistIntervalDemandBreakdown {
                interval_index: regime.interval_index,
                start_at: regime.start_at.clone(),
                end_at: regime.end_at.clone(),
                duration_days: ((parse_report_time(&regime.end_at)
                    - parse_report_time(&regime.start_at))
                .whole_seconds()
                .max(86_400) as f64)
                    / 86_400.0,
                service_demand_mean: 0.0,
                retail_demand_mean: 0.0,
                total_demand_mean: 0.0,
                restock_mean: 0.0,
                correction_mean: 0.0,
                observed_units: None,
                posterior_units_mean: 0.0,
            });
        }
        if interval_timeline.is_empty() {
            interval_timeline.push(SistIntervalDemandBreakdown {
                interval_index: 0,
                start_at: last_report.reported_at.clone(),
                end_at: last_report.reported_at.clone(),
                duration_days: 1.0,
                service_demand_mean: 0.0,
                retail_demand_mean: 0.0,
                total_demand_mean: 0.0,
                restock_mean: 0.0,
                correction_mean: 0.0,
                observed_units: None,
                posterior_units_mean: mean(
                    &particles
                        .iter()
                        .flat_map(|particle| particle.inventory.iter().copied())
                        .collect::<Vec<_>>(),
                ),
            });
        }
    }

    FinalAnalysisState {
        status: SistAnalysisStatus {
            state: SistAnalysisState::Ready,
            updated_at: Some(metadata.analysis_timestamp.clone()),
            report_count: metadata.report_count_used,
            confidence,
            reason: None,
        },
        interval_timeline,
    }
}

fn build_intervals(owner: &OwnerInventory) -> Vec<ModelInterval> {
    owner
        .sist
        .stock_reports
        .windows(2)
        .enumerate()
        .map(|(index, pair)| {
            let start = &pair[0];
            let end = &pair[1];
            let start_at = parse_report_time(&start.reported_at);
            let end_at = parse_report_time(&end.reported_at);
            let duration_days = ((end_at - start_at).whole_seconds().max(86_400) as f64) / 86_400.0;
            let start_observations = start
                .sku_observations
                .iter()
                .map(|observation| (observation.sku_id.clone(), observation))
                .collect::<HashMap<_, _>>();
            let sku_observations = end
                .sku_observations
                .iter()
                .map(|observation| {
                    let previous_units = start_observations
                        .get(&observation.sku_id)
                        .map(|previous| previous.units_in_stock)
                        .unwrap_or(observation.units_in_stock);
                    (
                        observation.sku_id.clone(),
                        IntervalSkuObservation {
                            previous_units,
                            observed_units: observation.units_in_stock,
                            restock_included: observation.restock_included,
                            retail_stockout: observation.retail_stockout,
                        },
                    )
                })
                .collect::<HashMap<_, _>>();
            ModelInterval {
                index: index + 1,
                start_at: start.reported_at.clone(),
                end_at: end.reported_at.clone(),
                duration_days,
                end_report: end.clone(),
                sku_observations,
                service_stockouts: end
                    .service_signals
                    .iter()
                    .filter(|signal| signal.stockout)
                    .map(|signal| signal.service_id.clone())
                    .collect(),
                service_price_adjustments: end
                    .service_price_adjustments
                    .iter()
                    .map(|adjustment| (adjustment.service_id.clone(), adjustment.price))
                    .collect(),
                service_ranking_positions: end
                    .top_service_ranking
                    .iter()
                    .enumerate()
                    .map(|(position, service_id)| (service_id.clone(), position))
                    .collect(),
                retail_ranking_positions: end
                    .top_retail_ranking
                    .iter()
                    .enumerate()
                    .map(|(position, sku_id)| (sku_id.clone(), position))
                    .collect(),
                notes_present: end.notes.is_some(),
            }
        })
        .collect()
}

fn initialize_particles(
    owner: &OwnerInventory,
    sku_index: &HashMap<String, usize>,
    particle_count: usize,
    owner_sub: &str,
) -> Vec<Particle> {
    let mut initial_inventory = vec![0.0; owner.catalog.skus.len()];
    if let Some(first_report) = owner.sist.stock_reports.first() {
        for observation in &first_report.sku_observations {
            if let Some(index) = sku_index.get(&observation.sku_id) {
                initial_inventory[*index] = observation.units_in_stock.max(0.0);
            }
        }
    } else {
        for (index, sku) in owner.catalog.skus.iter().enumerate() {
            initial_inventory[index] = sku.units_in_stock.max(0.0);
        }
    }

    let mut particles = Vec::with_capacity(particle_count);
    for particle_index in 0..particle_count {
        let mut rng =
            StdRng::seed_from_u64(stable_seed(&(owner_sub, "particle-init", particle_index)));
        let inventory = initial_inventory
            .iter()
            .map(|units| {
                (units + sample_standard_normal(&mut rng) * (units.sqrt() * 0.08 + 0.5)).max(0.0)
            })
            .collect();
        let service_log_intensity = owner
            .catalog
            .services
            .iter()
            .map(|service| ((service.sku_ids.len() as f64 * 0.35) + 0.5).ln())
            .collect();
        let retail_log_intensity = owner
            .catalog
            .skus
            .iter()
            .map(|sku| {
                if sku.sold_as_product {
                    (demand_hint_for_sku(sku, owner) + 0.2).ln()
                } else {
                    -6.0
                }
            })
            .collect();
        particles.push(Particle {
            inventory,
            service_log_intensity,
            retail_log_intensity,
        });
    }
    particles
}

fn evolve_particle(
    particle: &Particle,
    interval: &ModelInterval,
    owner: &OwnerInventory,
    service_links: &[Vec<usize>],
    sku_index: &HashMap<String, usize>,
    service_index: &HashMap<String, usize>,
    weekday_effects: &[f64; 7],
    regime_probs: &BTreeMap<SistRegime, f64>,
    change_point_probability: f64,
    rng: &mut StdRng,
) -> (Particle, ParticleIntervalState, f64) {
    let weekday_index = parse_report_time(&interval.end_at)
        .weekday()
        .number_days_from_monday() as usize;
    let seasonality = weekday_effects[weekday_index];
    let regime = sample_regime(regime_probs, rng);
    let change_point = rng.gen::<f64>() < change_point_probability;
    let mut next = particle.clone();
    let mut service_demand = vec![0.0; owner.catalog.skus.len()];
    let mut retail_demand = vec![0.0; owner.catalog.skus.len()];
    let mut restock = vec![0.0; owner.catalog.skus.len()];
    let mut correction = vec![0.0; owner.catalog.skus.len()];
    let mut service_activity = vec![0.0; owner.catalog.services.len()];
    let mut log_likelihood = 0.0;

    for (service_idx, service) in owner.catalog.services.iter().enumerate() {
        let ranking_shift = interval
            .service_ranking_positions
            .get(&service.service_id)
            .map(|position| ordinal_signal(*position) * 0.18)
            .unwrap_or(0.0);
        let stockout_shift = if interval.service_stockouts.contains(&service.service_id) {
            -0.12
        } else {
            0.0
        };
        let price_shift = interval
            .service_price_adjustments
            .get(&service.service_id)
            .map(|_| 0.08)
            .unwrap_or(0.0);
        let drift = sample_standard_normal(rng) * if change_point { 0.32 } else { 0.12 };
        next.service_log_intensity[service_idx] +=
            drift + seasonality + ranking_shift + stockout_shift + price_shift;
        let mean_count = (next.service_log_intensity[service_idx].exp()
            * regime_multiplier(regime)
            * interval.duration_days)
            .max(0.02);
        let sampled_count = sample_non_negative(mean_count, 0.45, rng);
        service_activity[service_idx] = sampled_count;
        let sku_links = &service_links[service_idx];
        if !sku_links.is_empty() {
            let base_usage = 1.0 / sku_links.len() as f64;
            for sku_idx in sku_links {
                let usage = sampled_count
                    * base_usage
                    * (1.0
                        + interval
                            .retail_ranking_positions
                            .get(&owner.catalog.skus[*sku_idx].sku_id)
                            .map(|position| ordinal_signal(*position) * 0.08)
                            .unwrap_or(0.0));
                service_demand[*sku_idx] += usage.max(0.0);
            }
        }
    }

    for (sku_idx, sku) in owner.catalog.skus.iter().enumerate() {
        let ranking_shift = interval
            .retail_ranking_positions
            .get(&sku.sku_id)
            .map(|position| ordinal_signal(*position) * 0.22)
            .unwrap_or(0.0);
        let stockout_shift = interval
            .sku_observations
            .get(&sku.sku_id)
            .map(|observation| {
                if observation.retail_stockout {
                    -0.16
                } else {
                    0.0
                }
            })
            .unwrap_or(0.0);
        let drift = sample_standard_normal(rng) * if change_point { 0.28 } else { 0.1 };
        if sku.sold_as_product {
            next.retail_log_intensity[sku_idx] +=
                drift + seasonality * 0.8 + ranking_shift + stockout_shift;
            let retail_mean = (next.retail_log_intensity[sku_idx].exp()
                * regime_multiplier(regime)
                * interval.duration_days)
                .max(0.0);
            retail_demand[sku_idx] = sample_non_negative(retail_mean, 0.35, rng);
        }

        let observation = interval.sku_observations.get(&sku.sku_id);
        let positive_jump = observation
            .map(|entry| (entry.observed_units - entry.previous_units).max(0.0))
            .unwrap_or(0.0);
        let restock_prob_base: f64 = observation
            .map(|entry| {
                0.03 + if entry.restock_included { 0.55 } else { 0.0 }
                    + if positive_jump > 2.0 { 0.18 } else { 0.0 }
                    + if entry.observed_units < entry.previous_units * 0.4 {
                        0.08
                    } else {
                        0.0
                    }
            })
            .unwrap_or(0.03);
        let restock_prob = restock_prob_base.max(0.0).min(0.95);
        let restock_happens = rng.gen::<f64>() < restock_prob;
        let desired = service_demand[sku_idx] + retail_demand[sku_idx];
        let restock_size = if restock_happens {
            sample_non_negative((positive_jump + desired * 0.6).max(1.0), 0.25, rng)
        } else {
            0.0
        };
        let available = next.inventory[sku_idx] + restock_size;
        let consumed = desired.min(available.max(0.0));
        let predicted_without_correction = (available - consumed).max(0.0);
        let correction_target = observation
            .map(|entry| entry.observed_units - predicted_without_correction)
            .unwrap_or(0.0);
        let correction_value = if correction_target.abs() > 1.0 {
            correction_target * 0.55
                + sample_standard_normal(rng) * correction_target.abs().max(1.0) * 0.1
        } else {
            sample_standard_normal(rng) * 0.25
        };
        let next_inventory = (predicted_without_correction + correction_value).max(0.0);
        restock[sku_idx] = restock_size;
        correction[sku_idx] = correction_value;
        next.inventory[sku_idx] = next_inventory;

        if let Some(observation) = observation {
            let sigma = observation.observed_units.max(1.0).sqrt() * 0.18 + 1.25;
            let residual = observation.observed_units - next_inventory;
            log_likelihood += -0.5 * (residual / sigma).powi(2);
            if observation.retail_stockout && next_inventory > desired.max(1.0) {
                log_likelihood -= 0.25;
            }
            if observation.restock_included && restock_size < 0.5 {
                log_likelihood -= 0.2;
            }
        }
    }

    let interval_state = ParticleIntervalState {
        inventory: next.inventory.clone(),
        service_demand,
        retail_demand,
        restock,
        correction,
        service_activity,
        regime,
    };
    let _ = sku_index;
    let _ = service_index;
    (next, interval_state, log_likelihood.clamp(-20.0, 5.0))
}

fn resample_particles(
    particles: Vec<Particle>,
    interval_states: Vec<ParticleIntervalState>,
    weights: Vec<f64>,
    rng: &mut StdRng,
) -> (Vec<Particle>, Vec<ParticleIntervalState>, f64) {
    let weight_sum = weights.iter().sum::<f64>();
    let normalized = if weight_sum.is_finite() && weight_sum > 0.0 {
        weights
            .iter()
            .map(|weight| weight / weight_sum)
            .collect::<Vec<_>>()
    } else {
        vec![1.0 / weights.len().max(1) as f64; weights.len()]
    };
    let ess = 1.0
        / normalized
            .iter()
            .map(|weight| weight.powi(2))
            .sum::<f64>()
            .max(1e-9);
    let mut cumulative = Vec::with_capacity(normalized.len());
    let mut running = 0.0;
    for weight in &normalized {
        running += *weight;
        cumulative.push(running);
    }

    let mut resampled_particles = Vec::with_capacity(particles.len());
    let mut resampled_states = Vec::with_capacity(interval_states.len());
    for _ in 0..particles.len() {
        let draw = rng.gen::<f64>();
        let index = cumulative
            .iter()
            .position(|threshold| *threshold >= draw)
            .unwrap_or(cumulative.len().saturating_sub(1));
        resampled_particles.push(particles[index].clone());
        resampled_states.push(interval_states[index].clone());
    }
    (resampled_particles, resampled_states, ess)
}

fn summarize_interval(
    interval: &ModelInterval,
    interval_states: &[ParticleIntervalState],
    owner: &OwnerInventory,
    service_links: &[Vec<usize>],
    sku_accumulators: &mut BTreeMap<String, SkuSummaryAccumulator>,
    service_accumulators: &mut BTreeMap<String, ServiceAccumulator>,
    signal_intake: &mut SistSignalIntakeSummary,
    dominant_regime: SistRegime,
) {
    for (sku_idx, sku) in owner.catalog.skus.iter().enumerate() {
        let inventory_values = interval_states
            .iter()
            .map(|state| state.inventory[sku_idx])
            .collect::<Vec<_>>();
        let service_values = interval_states
            .iter()
            .map(|state| state.service_demand[sku_idx])
            .collect::<Vec<_>>();
        let retail_values = interval_states
            .iter()
            .map(|state| state.retail_demand[sku_idx])
            .collect::<Vec<_>>();
        let restock_values = interval_states
            .iter()
            .map(|state| state.restock[sku_idx])
            .collect::<Vec<_>>();
        let correction_values = interval_states
            .iter()
            .map(|state| state.correction[sku_idx])
            .collect::<Vec<_>>();
        if let Some(accumulator) = sku_accumulators.get_mut(&sku.sku_id) {
            let mut sorted_inventory = inventory_values.clone();
            sorted_inventory.sort_by(cmp_f64);
            accumulator
                .posterior_inventory_trajectory
                .push(SistTrajectoryPoint {
                    at: interval.end_at.clone(),
                    mean: mean(&inventory_values),
                    low: quantile(&sorted_inventory, 0.1),
                    high: quantile(&sorted_inventory, 0.9),
                });
            accumulator
                .interval_demand
                .push(SistIntervalDemandBreakdown {
                    interval_index: interval.index,
                    start_at: interval.start_at.clone(),
                    end_at: interval.end_at.clone(),
                    duration_days: interval.duration_days,
                    service_demand_mean: mean(&service_values),
                    retail_demand_mean: mean(&retail_values),
                    total_demand_mean: mean(&service_values) + mean(&retail_values),
                    restock_mean: mean(&restock_values),
                    correction_mean: mean(&correction_values),
                    observed_units: interval
                        .sku_observations
                        .get(&sku.sku_id)
                        .map(|entry| entry.observed_units),
                    posterior_units_mean: mean(&inventory_values),
                });
            if let Some(observation) = interval.sku_observations.get(&sku.sku_id) {
                let correction_signal = (observation.observed_units
                    - (observation.previous_units + mean(&restock_values)
                        - mean(&service_values)
                        - mean(&retail_values)))
                .abs();
                if correction_signal > 2.0 {
                    signal_intake.correction_signals += 1;
                }
                accumulator
                    .evidence_summary
                    .push(SistReportEvidenceSummary {
                        report_id: interval.end_report.report_id.clone(),
                        reported_at: interval.end_at.clone(),
                        ranking_evidence: interval
                            .retail_ranking_positions
                            .get(&sku.sku_id)
                            .map(|position| ordinal_signal(*position))
                            .unwrap_or(0.0),
                        restock_evidence: if observation.restock_included {
                            1.0
                        } else {
                            0.0
                        },
                        stockout_evidence: if observation.retail_stockout {
                            1.0
                        } else {
                            0.0
                        },
                        price_adjustment_evidence: 0.0,
                        correction_evidence: correction_signal,
                        notes_present: interval.notes_present,
                    });
            }
        }
    }

    for (service_idx, service) in owner.catalog.services.iter().enumerate() {
        if let Some(accumulator) = service_accumulators.get_mut(&service.service_id) {
            let activity = interval_states
                .iter()
                .map(|state| state.service_activity[service_idx])
                .collect::<Vec<_>>();
            accumulator.activity_by_interval.push(mean(&activity));
            accumulator
                .evidence_timeline
                .push(SistReportEvidenceSummary {
                    report_id: interval.end_report.report_id.clone(),
                    reported_at: interval.end_at.clone(),
                    ranking_evidence: interval
                        .service_ranking_positions
                        .get(&service.service_id)
                        .map(|position| ordinal_signal(*position))
                        .unwrap_or(0.0),
                    restock_evidence: service_links[service_idx].len() as f64 * 0.1,
                    stockout_evidence: if interval.service_stockouts.contains(&service.service_id) {
                        1.0
                    } else {
                        0.0
                    },
                    price_adjustment_evidence: interval
                        .service_price_adjustments
                        .get(&service.service_id)
                        .map(|_| 1.0)
                        .unwrap_or(0.0),
                    correction_evidence: if dominant_regime == SistRegime::Correction {
                        0.6
                    } else {
                        0.0
                    },
                    notes_present: interval.notes_present,
                });
        }
    }
}

fn build_sku_insight(
    sku: &DesktopSkuRecord,
    owner: &OwnerInventory,
    particles: &[Particle],
    latest_regime: Option<&SistRegimePosteriorPoint>,
    confidence: SistConfidence,
    settings: &SistSettings,
) -> SistSkuInsight {
    let sku_idx = owner
        .catalog
        .skus
        .iter()
        .position(|entry| entry.sku_id == sku.sku_id)
        .unwrap_or(0);
    let inventory_draws = particles
        .iter()
        .map(|particle| particle.inventory[sku_idx])
        .collect::<Vec<_>>();
    let mut sorted_inventory = inventory_draws.clone();
    sorted_inventory.sort_by(cmp_f64);
    let demand_draws = particles
        .iter()
        .map(|particle| {
            let retail = particle.retail_log_intensity[sku_idx].exp().max(0.0);
            let service = owner
                .catalog
                .services
                .iter()
                .enumerate()
                .filter(|(_, service)| service.sku_ids.contains(&sku.sku_id))
                .map(|(service_idx, _)| particle.service_log_intensity[service_idx].exp() / 3.0)
                .sum::<f64>();
            (retail + service).max(0.01)
        })
        .collect::<Vec<_>>();
    let mut sorted_demand = demand_draws.clone();
    sorted_demand.sort_by(cmp_f64);
    let lead_time = infer_lead_time(
        sku,
        &owner
            .sist
            .stock_reports
            .iter()
            .filter_map(|report| {
                report
                    .sku_observations
                    .iter()
                    .find(|observation| observation.sku_id == sku.sku_id)
                    .map(|observation| (report, observation))
            })
            .collect::<Vec<_>>(),
    );
    let lead_time_demand = demand_draws
        .iter()
        .map(|demand| demand * lead_time.mean_days)
        .collect::<Vec<_>>();
    let mut sorted_lead = lead_time_demand.clone();
    sorted_lead.sort_by(cmp_f64);
    let reorder_point = quantile(&sorted_lead, settings.target_service_level);
    let latest_posterior_units = mean(&inventory_draws);
    let expected_demand_per_day = mean(&demand_draws).max(0.01);
    let days_of_cover = Some(latest_posterior_units / expected_demand_per_day.max(0.01));
    let stockout_risk = inventory_draws
        .iter()
        .zip(demand_draws.iter())
        .filter(|(inventory, demand)| **inventory <= (**demand * lead_time.mean_days))
        .count() as f64
        / inventory_draws.len().max(1) as f64;
    let reorder_trigger_probability = inventory_draws
        .iter()
        .filter(|inventory| **inventory <= reorder_point)
        .count() as f64
        / inventory_draws.len().max(1) as f64;
    let regime_probabilities = latest_regime
        .map(|entry| entry.regime_probabilities.clone())
        .unwrap_or_else(|| {
            let mut default = BTreeMap::new();
            default.insert("normal".to_string(), 1.0);
            default
        });
    SistSkuInsight {
        sku_id: sku.sku_id.clone(),
        latest_posterior_units,
        credible_interval_low: quantile(&sorted_inventory, 0.1),
        credible_interval_high: quantile(&sorted_inventory, 0.9),
        days_of_cover,
        stockout_risk,
        reorder_point,
        safety_stock: (reorder_point - mean(&lead_time_demand)).max(0.0),
        reorder_trigger_probability,
        expected_demand_per_day,
        demand_interval_low: quantile(&sorted_demand, 0.1),
        demand_interval_high: quantile(&sorted_demand, 0.9),
        lead_time,
        regime_probabilities,
        confidence,
    }
}

fn build_service_detail(
    service: &DesktopServiceRecord,
    owner: &OwnerInventory,
    sku_insights: &[SistSkuInsight],
    forecast: &ForecastOutputs,
    accumulator: ServiceAccumulator,
    regime_history: &[SistRegimePosteriorPoint],
    metadata: &SistAnalysisMetadata,
) -> SistServiceDetailResponse {
    let linked_insights = sku_insights
        .iter()
        .filter(|insight| service.sku_ids.contains(&insight.sku_id))
        .collect::<Vec<_>>();
    let bottleneck_probability = linked_insights
        .iter()
        .map(|insight| insight.stockout_risk)
        .fold(0.0, f64::max);
    let contributors = linked_insights
        .iter()
        .map(|insight| SistServiceContributor {
            sku_id: insight.sku_id.clone(),
            pressure_probability: insight
                .stockout_risk
                .max(insight.reorder_trigger_probability),
            expected_days_of_cover: insight.days_of_cover,
        })
        .collect::<Vec<_>>();
    let viability_forecast = forecast_service_viability(service, owner, sku_insights, forecast);
    let disruption_window = disruption_window(&viability_forecast);
    SistServiceDetailResponse {
        service_id: service.service_id.clone(),
        service_name: service.name.clone(),
        estimated_activity_per_interval: accumulator
            .activity_by_interval
            .last()
            .copied()
            .unwrap_or(0.0),
        bottleneck_probability,
        viability_forecast,
        contributors,
        disruption_window,
        evidence_timeline: accumulator.evidence_timeline,
        regime_timeline: regime_history.to_vec(),
        metadata: Some(metadata.clone()),
    }
}

fn forecast_system(
    owner: &OwnerInventory,
    particles: &[Particle],
    service_links: &[Vec<usize>],
    sku_index: &HashMap<String, usize>,
    _service_index: &HashMap<String, usize>,
    horizon_days: usize,
    owner_sub: &str,
) -> ForecastOutputs {
    let mut sku_forecasts = owner
        .catalog
        .skus
        .iter()
        .map(|sku| (sku.sku_id.clone(), Vec::new()))
        .collect::<BTreeMap<_, _>>();
    let mut forecast_particles = particles.to_vec();
    for day in 1..=horizon_days {
        let mut rng = StdRng::seed_from_u64(stable_seed(&(owner_sub, "forecast", day)));
        for particle in &mut forecast_particles {
            for service_idx in 0..owner.catalog.services.len() {
                particle.service_log_intensity[service_idx] +=
                    sample_standard_normal(&mut rng) * 0.04;
            }
            for sku_idx in 0..owner.catalog.skus.len() {
                particle.retail_log_intensity[sku_idx] += sample_standard_normal(&mut rng) * 0.03;
            }
            for (sku_idx, sku) in owner.catalog.skus.iter().enumerate() {
                let service_demand = owner
                    .catalog
                    .services
                    .iter()
                    .enumerate()
                    .filter(|(_, service)| service.sku_ids.contains(&sku.sku_id))
                    .map(|(service_idx, _service)| {
                        let divisor = service_links[service_idx].len().max(1) as f64;
                        particle.service_log_intensity[service_idx].exp() / divisor
                    })
                    .sum::<f64>();
                let retail_demand = if sku.sold_as_product {
                    particle.retail_log_intensity[sku_idx].exp()
                } else {
                    0.0
                };
                particle.inventory[sku_idx] =
                    (particle.inventory[sku_idx] - (service_demand + retail_demand)).max(0.0);
            }
        }
        for sku in &owner.catalog.skus {
            if let Some(idx) = sku_index.get(&sku.sku_id) {
                let draws = forecast_particles
                    .iter()
                    .map(|particle| particle.inventory[*idx])
                    .collect::<Vec<_>>();
                let mut sorted = draws.clone();
                sorted.sort_by(cmp_f64);
                if let Some(series) = sku_forecasts.get_mut(&sku.sku_id) {
                    series.push(SistTrajectoryPoint {
                        at: format!("day-{day}"),
                        mean: mean(&draws),
                        low: quantile(&sorted, 0.1),
                        high: quantile(&sorted, 0.9),
                    });
                }
            }
        }
    }
    ForecastOutputs { sku_forecasts }
}

fn forecast_service_viability(
    service: &DesktopServiceRecord,
    owner: &OwnerInventory,
    sku_insights: &[SistSkuInsight],
    forecast: &ForecastOutputs,
) -> Vec<SistTrajectoryPoint> {
    let linked_skus = owner
        .catalog
        .skus
        .iter()
        .filter(|sku| service.sku_ids.contains(&sku.sku_id))
        .collect::<Vec<_>>();
    if linked_skus.is_empty() {
        return Vec::new();
    }
    let horizon = forecast
        .sku_forecasts
        .values()
        .next()
        .map(|points: &Vec<SistTrajectoryPoint>| points.len())
        .unwrap_or(0);
    let mut points = Vec::with_capacity(horizon);
    for index in 0..horizon {
        let viability_scores = linked_skus
            .iter()
            .map(|sku| {
                let point = forecast
                    .sku_forecasts
                    .get(&sku.sku_id)
                    .and_then(|points: &Vec<SistTrajectoryPoint>| points.get(index))
                    .cloned()
                    .unwrap_or(SistTrajectoryPoint {
                        at: format!("day-{}", index + 1),
                        mean: 0.0,
                        low: 0.0,
                        high: 0.0,
                    });
                let insight = sku_insights.iter().find(|entry| entry.sku_id == sku.sku_id);
                let demand = insight
                    .map(|entry| entry.expected_demand_per_day.max(0.2))
                    .unwrap_or(0.2);
                (
                    (point.mean / (demand + point.mean + 1.0)).clamp(0.0, 1.0),
                    (point.low / (demand + point.low + 1.0)).clamp(0.0, 1.0),
                    (point.high / (demand + point.high + 1.0)).clamp(0.0, 1.0),
                )
            })
            .collect::<Vec<_>>();
        let mean_value = viability_scores
            .iter()
            .map(|entry| entry.0)
            .fold(1.0, f64::min);
        let low_value = viability_scores
            .iter()
            .map(|entry| entry.1)
            .fold(1.0, f64::min);
        let high_value = viability_scores
            .iter()
            .map(|entry| entry.2)
            .fold(1.0, f64::min);
        points.push(SistTrajectoryPoint {
            at: format!("day-{}", index + 1),
            mean: mean_value,
            low: low_value,
            high: high_value,
        });
    }
    points
}

fn disruption_window(points: &[SistTrajectoryPoint]) -> SistDisruptionWindow {
    let start = points
        .iter()
        .find(|point| point.mean < 0.5)
        .map(|point| point.at.clone());
    let end = start.as_ref().and_then(|_| {
        points
            .iter()
            .rev()
            .find(|point| point.mean < 0.65)
            .map(|point| point.at.clone())
    });
    let probability = points
        .iter()
        .map(|point| 1.0 - point.mean)
        .fold(0.0, f64::max);
    SistDisruptionWindow {
        start_at: start,
        end_at: end,
        probability,
    }
}

fn weekday_effects(intervals: &[ModelInterval], active: bool) -> [f64; 7] {
    if !active {
        return [0.0; 7];
    }
    let mut weekday_signal = [
        Vec::<f64>::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
        Vec::new(),
    ];
    for interval in intervals {
        let weekday = parse_report_time(&interval.end_at)
            .weekday()
            .number_days_from_monday() as usize;
        let signal = interval.service_ranking_positions.len() as f64 * 0.08
            + interval.retail_ranking_positions.len() as f64 * 0.04
            + interval.service_stockouts.len() as f64 * 0.06;
        weekday_signal[weekday].push(signal);
    }
    let all_values = weekday_signal
        .iter()
        .flat_map(|values| values.iter().copied())
        .collect::<Vec<_>>();
    let global_mean = mean(&all_values);
    let mut effects = [0.0; 7];
    for (index, values) in weekday_signal.iter().enumerate() {
        effects[index] = ((mean(values) - global_mean) * 0.15).clamp(-0.2, 0.2);
    }
    effects
}

fn regime_probabilities(interval: &ModelInterval) -> BTreeMap<SistRegime, f64> {
    let mut weights = BTreeMap::from([
        (SistRegime::Normal, 1.0),
        (SistRegime::Spike, 0.2),
        (SistRegime::Lull, 0.2),
        (SistRegime::StockoutConstrained, 0.2),
        (SistRegime::Promo, 0.15),
        (SistRegime::Correction, 0.15),
    ]);
    let stockout_count = interval.service_stockouts.len() as f64
        + interval
            .sku_observations
            .values()
            .filter(|observation| observation.retail_stockout)
            .count() as f64;
    let restock_count = interval
        .sku_observations
        .values()
        .filter(|observation| observation.restock_included)
        .count() as f64;
    let ranking_pressure = interval
        .service_ranking_positions
        .values()
        .map(|position| ordinal_signal(*position))
        .sum::<f64>()
        + interval
            .retail_ranking_positions
            .values()
            .map(|position| ordinal_signal(*position))
            .sum::<f64>();
    let price_changes = interval.service_price_adjustments.len() as f64;
    let correction_signal = interval
        .sku_observations
        .values()
        .map(|observation| {
            let net_delta = observation.observed_units - observation.previous_units;
            if net_delta.abs() > observation.previous_units.max(8.0) * 0.35 {
                1.0
            } else {
                0.0
            }
        })
        .sum::<f64>();

    *weights.get_mut(&SistRegime::Spike).unwrap() += ranking_pressure * 0.6;
    *weights.get_mut(&SistRegime::Lull).unwrap() +=
        if ranking_pressure < 0.2 { 0.35 } else { 0.0 } + restock_count * 0.05;
    *weights.get_mut(&SistRegime::StockoutConstrained).unwrap() += stockout_count * 0.85;
    *weights.get_mut(&SistRegime::Promo).unwrap() += price_changes * 0.5 + ranking_pressure * 0.25;
    *weights.get_mut(&SistRegime::Correction).unwrap() += correction_signal * 0.9;
    *weights.get_mut(&SistRegime::Normal).unwrap() +=
        (1.0 - stockout_count.min(1.0) * 0.2).max(0.1);

    normalize_regime_weights(weights)
}

fn regime_change_point_probability(interval: &ModelInterval) -> f64 {
    let jump_signal = interval
        .sku_observations
        .values()
        .map(|observation| {
            let change = (observation.observed_units - observation.previous_units).abs();
            let baseline = observation.previous_units.max(6.0);
            (change / baseline).min(2.0)
        })
        .sum::<f64>()
        / interval.sku_observations.len().max(1) as f64;
    (0.05
        + jump_signal * 0.22
        + interval.service_price_adjustments.len() as f64 * 0.08
        + if interval.notes_present { 0.03 } else { 0.0 })
    .clamp(0.0, 0.8)
}

fn regime_probabilities_from_states(states: &[ParticleIntervalState]) -> BTreeMap<SistRegime, f64> {
    let mut weights = BTreeMap::from([
        (SistRegime::Normal, 0.0),
        (SistRegime::Spike, 0.0),
        (SistRegime::Lull, 0.0),
        (SistRegime::StockoutConstrained, 0.0),
        (SistRegime::Promo, 0.0),
        (SistRegime::Correction, 0.0),
    ]);
    for state in states {
        *weights.get_mut(&state.regime).unwrap() += 1.0;
    }
    let total = states.len().max(1) as f64;
    for value in weights.values_mut() {
        *value /= total;
    }
    weights
}

fn dominant_regime(weights: &BTreeMap<SistRegime, f64>) -> SistRegime {
    weights
        .iter()
        .max_by(|left, right| {
            left.1
                .partial_cmp(right.1)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
        .map(|(regime, _)| *regime)
        .unwrap_or(SistRegime::Normal)
}

fn normalize_regime_weights(mut weights: BTreeMap<SistRegime, f64>) -> BTreeMap<SistRegime, f64> {
    let total = weights.values().sum::<f64>().max(1e-9);
    for value in weights.values_mut() {
        *value /= total;
    }
    weights
}

fn sample_regime(weights: &BTreeMap<SistRegime, f64>, rng: &mut StdRng) -> SistRegime {
    let draw = rng.gen::<f64>();
    let mut running = 0.0;
    for (regime, weight) in weights {
        running += *weight;
        if draw <= running {
            return *regime;
        }
    }
    SistRegime::Normal
}

fn regime_multiplier(regime: SistRegime) -> f64 {
    match regime {
        SistRegime::Normal => 1.0,
        SistRegime::Spike => 1.35,
        SistRegime::Lull => 0.72,
        SistRegime::StockoutConstrained => 0.84,
        SistRegime::Promo => 1.55,
        SistRegime::Correction => 0.93,
    }
}

fn ordinal_signal(position: usize) -> f64 {
    ((10usize.saturating_sub(position)) as f64 / 10.0).clamp(0.0, 1.0)
}

fn sample_non_negative(mean_value: f64, dispersion: f64, rng: &mut StdRng) -> f64 {
    let sigma = (mean_value.max(0.0) * (1.0 + dispersion)).sqrt();
    (mean_value + sample_standard_normal(rng) * sigma).max(0.0)
}

fn regime_key(regime: SistRegime) -> &'static str {
    match regime {
        SistRegime::Normal => "normal",
        SistRegime::Spike => "spike",
        SistRegime::Lull => "lull",
        SistRegime::StockoutConstrained => "stockout_constrained",
        SistRegime::Promo => "promo",
        SistRegime::Correction => "correction",
    }
}
