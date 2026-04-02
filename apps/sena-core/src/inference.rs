use crate::normalize::{build_intervals, lead_time_variability_class};
use crate::types::{
    SenaAnalysisOutputs, SenaAnalysisRunSummary, SenaArtifactReference, SenaDemandPosterior,
    SenaDiagnosticsSummary, SenaInventoryPosterior, SenaLeadTimeHint, SenaLeadTimePosterior,
    SenaOrderPipelinePosterior, SenaRegime, SenaReorderPolicy, SenaRunStatus, SenaServicePosterior,
    SenaSku, SenaSkuPosterior, SenaWorkspaceData, SenaWorkspaceSummary,
};
use anyhow::Result;
use std::collections::{BTreeMap, HashMap};
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

pub fn update_pipeline_units(
    previous_pipeline: f64,
    placed_quantity: f64,
    received_quantity: f64,
) -> f64 {
    (previous_pipeline + placed_quantity - received_quantity).max(0.0)
}

pub fn update_time_since_last_order_days(
    previous_days: f64,
    duration_days: f64,
    order_placed: bool,
) -> f64 {
    if order_placed {
        0.0
    } else {
        (previous_days + duration_days).max(0.0)
    }
}

pub fn interval_stockout_risk(
    current_units: f64,
    demand_rate_mean: f64,
    duration_days: f64,
    stockout_signaled: bool,
) -> f64 {
    if stockout_signaled {
        return 0.95;
    }
    if current_units <= 0.0 {
        return 1.0;
    }
    let exposure = demand_rate_mean * duration_days.max(1.0);
    (exposure / (current_units + exposure + 1.0)).clamp(0.01, 0.99)
}

pub fn normal_quantile(p: f64) -> f64 {
    let p = p.clamp(1e-9, 1.0 - 1e-9);
    const A: [f64; 6] = [
        -3.969683028665376e+01,
        2.209460984245205e+02,
        -2.759285104469687e+02,
        1.383577518672690e+02,
        -3.066479806614716e+01,
        2.506628277459239e+00,
    ];
    const B: [f64; 5] = [
        -5.447609879822406e+01,
        1.615858368580409e+02,
        -1.556989798598866e+02,
        6.680131188771972e+01,
        -1.328068155288572e+01,
    ];
    const C: [f64; 6] = [
        -7.784894002430293e-03,
        -3.223964580411365e-01,
        -2.400758277161838e+00,
        -2.549732539343734e+00,
        4.374664141464968e+00,
        2.938163982698783e+00,
    ];
    const D: [f64; 4] = [
        7.784695709041462e-03,
        3.224671290700398e-01,
        2.445134137142996e+00,
        3.754408661907416e+00,
    ];
    const P_LOW: f64 = 0.02425;
    const P_HIGH: f64 = 1.0 - P_LOW;

    if p < P_LOW {
        let q = (-2.0 * p.ln()).sqrt();
        return (((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
            / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0);
    }
    if p > P_HIGH {
        let q = (-2.0 * (1.0 - p).ln()).sqrt();
        return -(((((C[0] * q + C[1]) * q + C[2]) * q + C[3]) * q + C[4]) * q + C[5])
            / ((((D[0] * q + D[1]) * q + D[2]) * q + D[3]) * q + 1.0);
    }

    let q = p - 0.5;
    let r = q * q;
    (((((A[0] * r + A[1]) * r + A[2]) * r + A[3]) * r + A[4]) * r + A[5]) * q
        / (((((B[0] * r + B[1]) * r + B[2]) * r + B[3]) * r + B[4]) * r + 1.0)
}

pub fn reorder_point_quantile(
    target_service_level: f64,
    demand_rate_mean: f64,
    demand_rate_std: f64,
    lead_time_mean_days: f64,
    lead_time_variance_days: f64,
) -> (f64, f64) {
    let mean = demand_rate_mean * lead_time_mean_days.max(0.0);
    let variance = lead_time_mean_days.powi(2) * demand_rate_std.powi(2)
        + demand_rate_mean.powi(2) * lead_time_variance_days.max(0.0)
        + demand_rate_std.powi(2) * lead_time_variance_days.max(0.0);
    let z = normal_quantile(target_service_level);
    let safety_stock = z.max(0.0) * variance.sqrt();
    (mean + safety_stock, safety_stock)
}

fn regime_probabilities(
    stockout_count: usize,
    ranking_count: usize,
    price_change_count: usize,
    demand_rate_mean: f64,
) -> (SenaRegime, BTreeMap<String, f64>) {
    let mut weights = BTreeMap::from([
        ("normal".to_string(), 1.0),
        (
            "spike".to_string(),
            if demand_rate_mean > 10.0 { 1.6 } else { 0.6 },
        ),
        (
            "lull".to_string(),
            if demand_rate_mean < 1.0 { 1.2 } else { 0.4 },
        ),
        (
            "stockout_constrained".to_string(),
            if stockout_count > 0 { 2.2 } else { 0.5 },
        ),
        (
            "promo".to_string(),
            if ranking_count > 2 { 1.4 } else { 0.5 },
        ),
        (
            "correction".to_string(),
            if price_change_count > 0 { 1.1 } else { 0.4 },
        ),
    ]);
    let total = weights.values().sum::<f64>().max(1.0);
    for value in weights.values_mut() {
        *value /= total;
    }
    let top = weights
        .iter()
        .max_by(|left, right| left.1.partial_cmp(right.1).unwrap())
        .map(|(key, _)| match key.as_str() {
            "spike" => SenaRegime::Spike,
            "lull" => SenaRegime::Lull,
            "stockout_constrained" => SenaRegime::StockoutConstrained,
            "promo" => SenaRegime::Promo,
            "correction" => SenaRegime::Correction,
            _ => SenaRegime::Normal,
        })
        .unwrap_or(SenaRegime::Normal);
    (top, weights)
}

fn lead_time_for_sku(sku: &SenaSku, hints: &[SenaLeadTimeHint]) -> SenaLeadTimePosterior {
    let hint = hints.iter().rev().find(|hint| hint.sku_id == sku.sku_id);
    let mean_days = hint
        .and_then(|hint| hint.typical_days)
        .or(sku.default_lead_time_days)
        .unwrap_or(3.0);
    let variance_days = if let Some(hint) = hint {
        match (hint.low_days, hint.high_days) {
            (Some(low), Some(high)) if high >= low => ((high - low) / 2.0).powi(2).max(0.25),
            _ => sku
                .default_lead_time_variability
                .unwrap_or(1.0)
                .powi(2)
                .max(0.25),
        }
    } else {
        sku.default_lead_time_variability
            .unwrap_or(1.0)
            .powi(2)
            .max(0.25)
    };

    SenaLeadTimePosterior {
        mean_days,
        variance_days,
        variability_class: lead_time_variability_class(hint),
    }
}

pub fn analyze_workspace(
    workspace: &SenaWorkspaceData,
    run_id: String,
    artifact: Option<SenaArtifactReference>,
) -> Result<SenaAnalysisOutputs> {
    let now = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string());
    let intervals = build_intervals(&workspace.skus, &workspace.observations)?;

    let mut sku_posteriors = BTreeMap::new();
    let mut service_posteriors = BTreeMap::new();
    let mut diagnostics_intervals = Vec::new();
    let mut high_risk_sku_ids = Vec::new();
    let mut pending_reorder_count = 0usize;
    let mut top_regime = None;

    let mut days_since_last_order: HashMap<String, f64> = HashMap::new();
    let latest_observation = workspace.observations.last();
    let latest_hints = latest_observation
        .map(|observation| observation.lead_time_hints.clone())
        .unwrap_or_default();

    for sku in &workspace.skus {
        let mut demand_rates = Vec::new();
        let mut placed_total = 0.0;
        let mut received_total = 0.0;
        let mut pipeline_latest = 0.0;
        let stockout_signaled = workspace
            .observations
            .iter()
            .any(|observation| observation.retail_stockouts.contains(&sku.sku_id));
        let ranking_count = workspace
            .observations
            .iter()
            .filter(|observation| observation.top_retail_ranking.contains(&sku.sku_id))
            .count();
        let price_change_count = workspace
            .observations
            .iter()
            .filter(|observation| {
                observation
                    .retail_prices
                    .iter()
                    .any(|price| price.sku_id == sku.sku_id)
            })
            .count();

        for interval in &intervals {
            let demand = interval
                .demand_by_sku
                .get(&sku.sku_id)
                .copied()
                .unwrap_or(0.0);
            let demand_rate = demand / interval.duration_days.max(1.0 / 24.0);
            demand_rates.push(demand_rate);
            let placed = interval
                .placed_by_sku
                .get(&sku.sku_id)
                .copied()
                .unwrap_or(0.0);
            let received = interval
                .received_by_sku
                .get(&sku.sku_id)
                .copied()
                .unwrap_or(0.0);
            placed_total += placed;
            received_total += received;
            pipeline_latest = interval
                .pipeline_by_sku
                .get(&sku.sku_id)
                .copied()
                .unwrap_or(0.0);
            let current_days = days_since_last_order
                .get(&sku.sku_id)
                .copied()
                .unwrap_or(0.0);
            let next_days = update_time_since_last_order_days(
                current_days,
                interval.duration_days,
                placed > 0.0,
            );
            days_since_last_order.insert(sku.sku_id.clone(), next_days);
        }

        let demand_rate_mean = if demand_rates.is_empty() {
            0.0
        } else {
            demand_rates.iter().sum::<f64>() / demand_rates.len() as f64
        };
        let demand_rate_std = if demand_rates.len() <= 1 {
            (demand_rate_mean.max(1.0) * 0.2).max(0.1)
        } else {
            let mean = demand_rate_mean;
            let variance = demand_rates
                .iter()
                .map(|value| (value - mean).powi(2))
                .sum::<f64>()
                / (demand_rates.len() - 1) as f64;
            variance.sqrt().max(0.1)
        };
        let lead_time = lead_time_for_sku(sku, &latest_hints);
        let lead_time_mean_days = lead_time.mean_days;
        let lead_time_variance_days = lead_time.variance_days;
        let (dominant_regime, regime_probabilities) = regime_probabilities(
            usize::from(stockout_signaled),
            ranking_count,
            price_change_count,
            demand_rate_mean,
        );
        top_regime.get_or_insert(dominant_regime.clone());
        let stockout_risk = interval_stockout_risk(
            sku.current_stock_units,
            demand_rate_mean,
            lead_time_mean_days.max(1.0),
            stockout_signaled,
        );
        let (reorder_point, safety_stock) = reorder_point_quantile(
            sku.reorder_target_service_level,
            demand_rate_mean,
            demand_rate_std,
            lead_time_mean_days,
            lead_time_variance_days,
        );
        let reorder_trigger_probability = if sku.current_stock_units <= reorder_point {
            0.85
        } else {
            (reorder_point / (sku.current_stock_units + reorder_point + 1.0)).clamp(0.05, 0.75)
        };
        let days_of_cover = if demand_rate_mean > 0.0 {
            Some(sku.current_stock_units / demand_rate_mean)
        } else {
            None
        };
        if stockout_risk >= 0.5 || reorder_trigger_probability >= 0.5 {
            high_risk_sku_ids.push(sku.sku_id.clone());
            pending_reorder_count += 1;
        }

        let interval_diagnostics = intervals
            .iter()
            .map(|interval| SenaDiagnosticsSummary {
                observation_count: workspace.observations.len(),
                interval_count: intervals.len(),
                effective_sample_size_hint: 128.0,
                ranking_signal_count: workspace
                    .observations
                    .iter()
                    .map(|observation| {
                        observation.top_service_ranking.len() + observation.top_retail_ranking.len()
                    })
                    .sum(),
                stockout_signal_count: workspace
                    .observations
                    .iter()
                    .map(|observation| {
                        observation.service_stockouts.len() + observation.retail_stockouts.len()
                    })
                    .sum(),
                order_signal_count: workspace
                    .observations
                    .iter()
                    .map(|observation| observation.order_events.len())
                    .sum(),
                top_regime: Some(dominant_regime.clone()),
                intervals: vec![crate::types::SenaIntervalDiagnostics {
                    interval_index: interval.interval_index,
                    start_at: interval.start_at.clone(),
                    end_at: interval.end_at.clone(),
                    duration_days: interval.duration_days,
                    service_demand_mean: demand_rate_mean * interval.duration_days * 0.6,
                    retail_demand_mean: demand_rate_mean * interval.duration_days * 0.4,
                    total_demand_mean: demand_rate_mean * interval.duration_days,
                    placed_quantity_mean: interval
                        .placed_by_sku
                        .get(&sku.sku_id)
                        .copied()
                        .unwrap_or(0.0),
                    received_quantity_mean: interval
                        .received_by_sku
                        .get(&sku.sku_id)
                        .copied()
                        .unwrap_or(0.0),
                    correction_mean: 0.0,
                    pipeline_units_mean: interval
                        .pipeline_by_sku
                        .get(&sku.sku_id)
                        .copied()
                        .unwrap_or(0.0),
                    stockout_risk,
                    dominant_regime: dominant_regime.clone(),
                }],
            })
            .flat_map(|summary| summary.intervals)
            .collect::<Vec<_>>();

        diagnostics_intervals.extend(interval_diagnostics.iter().cloned());

        sku_posteriors.insert(
            sku.sku_id.clone(),
            SenaSkuPosterior {
                sku_id: sku.sku_id.clone(),
                inventory: SenaInventoryPosterior {
                    latest_units_mean: sku.current_stock_units,
                    credible_interval_low: (sku.current_stock_units - demand_rate_std).max(0.0),
                    credible_interval_high: sku.current_stock_units + demand_rate_std,
                    probability_near_zero: stockout_risk,
                },
                demand: SenaDemandPosterior {
                    demand_rate_mean,
                    demand_rate_low: (demand_rate_mean - demand_rate_std).max(0.0),
                    demand_rate_high: demand_rate_mean + demand_rate_std,
                    forecast_rate_mean: demand_rate_mean,
                    lost_demand_mean: if stockout_signaled {
                        demand_rate_mean * 0.15
                    } else {
                        0.0
                    },
                },
                order_pipeline: SenaOrderPipelinePosterior {
                    placed_quantity_mean: placed_total / intervals.len().max(1) as f64,
                    received_quantity_mean: received_total / intervals.len().max(1) as f64,
                    pipeline_units_mean: pipeline_latest,
                    reorder_trigger_probability,
                    days_since_last_order: days_since_last_order
                        .get(&sku.sku_id)
                        .copied()
                        .unwrap_or(0.0),
                },
                lead_time,
                reorder_policy: SenaReorderPolicy {
                    target_service_level: sku.reorder_target_service_level,
                    expected_lead_time_demand: demand_rate_mean * lead_time_mean_days,
                    safety_stock,
                    reorder_point,
                    reorder_trigger_probability,
                    days_of_cover,
                },
                intervals: interval_diagnostics,
                regime_probabilities,
            },
        );
    }

    for service in &workspace.services {
        let constrained_sku_ids = service
            .recipe_links
            .iter()
            .filter_map(|link| {
                high_risk_sku_ids
                    .contains(&link.sku_id)
                    .then(|| link.sku_id.clone())
            })
            .collect::<Vec<_>>();
        let activity = if workspace.observations.is_empty() {
            0.0
        } else {
            workspace
                .observations
                .iter()
                .filter(|observation| {
                    observation
                        .top_service_ranking
                        .contains(&service.service_id)
                })
                .count() as f64
                / workspace.observations.len() as f64
                * 10.0
        };
        let dominant_regime = if constrained_sku_ids.is_empty() {
            top_regime.clone().unwrap_or(SenaRegime::Normal)
        } else {
            SenaRegime::StockoutConstrained
        };
        service_posteriors.insert(
            service.service_id.clone(),
            SenaServicePosterior {
                service_id: service.service_id.clone(),
                estimated_activity_per_interval: activity,
                bottleneck_probability: if constrained_sku_ids.is_empty() {
                    0.1
                } else {
                    0.75
                },
                revenue_mean: activity * service.base_price,
                dominant_regime,
                constrained_sku_ids,
            },
        );
    }

    let diagnostics = SenaDiagnosticsSummary {
        observation_count: workspace.observations.len(),
        interval_count: intervals.len(),
        effective_sample_size_hint: 128.0,
        ranking_signal_count: workspace
            .observations
            .iter()
            .map(|observation| {
                observation.top_service_ranking.len() + observation.top_retail_ranking.len()
            })
            .sum(),
        stockout_signal_count: workspace
            .observations
            .iter()
            .map(|observation| {
                observation.service_stockouts.len() + observation.retail_stockouts.len()
            })
            .sum(),
        order_signal_count: workspace
            .observations
            .iter()
            .map(|observation| observation.order_events.len())
            .sum(),
        top_regime: top_regime.clone(),
        intervals: diagnostics_intervals,
    };

    let run = SenaAnalysisRunSummary {
        run_id,
        status: SenaRunStatus::Succeeded,
        started_at: now.clone(),
        completed_at: Some(now.clone()),
        observation_count: workspace.observations.len(),
        interval_count: intervals.len(),
        top_regime: top_regime.clone(),
        artifacts: artifact.into_iter().collect(),
    };

    let workspace_summary = SenaWorkspaceSummary {
        skus: workspace.skus.clone(),
        services: workspace.services.clone(),
        observations: workspace.observations.clone(),
        latest_run: Some(run.clone()),
        diagnostics: diagnostics.clone(),
        high_risk_sku_ids,
        pending_reorder_count,
    };

    Ok(SenaAnalysisOutputs {
        run,
        workspace: workspace_summary,
        sku_posteriors,
        service_posteriors,
        diagnostics,
    })
}
