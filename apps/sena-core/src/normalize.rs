use crate::types::{SenaLeadTimeHint, SenaObservationRecord, SenaOrderEventInput, SenaSku};
use anyhow::{anyhow, Result};
use std::collections::HashMap;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

#[derive(Debug, Clone)]
pub struct NormalizedInterval {
    pub interval_index: usize,
    pub start_at: String,
    pub end_at: String,
    pub duration_days: f64,
    pub demand_by_sku: HashMap<String, f64>,
    pub placed_by_sku: HashMap<String, f64>,
    pub received_by_sku: HashMap<String, f64>,
    pub pipeline_by_sku: HashMap<String, f64>,
}

fn parse_time(value: &str) -> Result<OffsetDateTime> {
    OffsetDateTime::parse(value, &Rfc3339).map_err(|_| anyhow!("invalid RFC3339 timestamp"))
}

pub fn lead_time_variability_class(hint: Option<&SenaLeadTimeHint>) -> String {
    let Some(hint) = hint else {
        return "moderate".to_string();
    };
    let width = match (hint.low_days, hint.high_days) {
        (Some(low), Some(high)) if high >= low => high - low,
        _ => return "moderate".to_string(),
    };
    let mean = hint
        .typical_days
        .unwrap_or((hint.low_days.unwrap_or(0.0) + hint.high_days.unwrap_or(0.0)) / 2.0);
    let denom = mean.max(0.5);
    let ratio = width / denom;
    if ratio <= 0.25 {
        "very_stable".to_string()
    } else if ratio <= 0.75 {
        "moderate".to_string()
    } else {
        "volatile".to_string()
    }
}

pub fn assign_receipt_quantity(
    event: Option<&SenaOrderEventInput>,
    default_lead_time_days: f64,
    interval_duration_days: f64,
    inventory_gain: f64,
) -> f64 {
    if let Some(event) = event {
        if let Some(quantity) = event.received_quantity {
            return quantity.max(0.0);
        }
        if event.order_received {
            return inventory_gain.max(0.0);
        }
    }
    if interval_duration_days <= 0.0 {
        return 0.0;
    }
    if inventory_gain <= 0.0 {
        return 0.0;
    }
    if default_lead_time_days <= interval_duration_days * 2.0 {
        inventory_gain.max(0.0)
    } else {
        0.0
    }
}

pub fn build_intervals(
    skus: &[SenaSku],
    observations: &[SenaObservationRecord],
) -> Result<Vec<NormalizedInterval>> {
    if observations.is_empty() {
        return Ok(Vec::new());
    }

    let mut sorted = observations.to_vec();
    sorted.sort_by(|left, right| left.reported_at.cmp(&right.reported_at));

    let mut previous_stock = HashMap::new();
    let mut pipeline = HashMap::new();
    for sku in skus {
        previous_stock.insert(sku.sku_id.clone(), sku.current_stock_units.max(0.0));
        pipeline.insert(sku.sku_id.clone(), 0.0);
    }

    let mut intervals = Vec::new();
    for (index, current) in sorted.iter().enumerate() {
        let current_time = parse_time(&current.reported_at)?;
        let (start_at, duration_days) = if let Some(previous) = sorted.get(index.saturating_sub(1))
        {
            let previous_time = parse_time(&previous.reported_at)?;
            let duration = (current_time - previous_time).whole_seconds() as f64 / 86_400.0;
            (previous.reported_at.clone(), duration.max(1.0 / 24.0))
        } else {
            (current.reported_at.clone(), 1.0)
        };

        let mut demand_by_sku = HashMap::new();
        let mut placed_by_sku = HashMap::new();
        let mut received_by_sku = HashMap::new();
        let mut pipeline_by_sku = HashMap::new();

        for snapshot in &current.sku_snapshots {
            let previous_units = previous_stock.get(&snapshot.sku_id).copied().unwrap_or(0.0);
            let inventory_gain = (snapshot.units_in_stock - previous_units).max(0.0);
            let event = current
                .order_events
                .iter()
                .find(|event| event.sku_id == snapshot.sku_id);
            let sku = skus.iter().find(|sku| sku.sku_id == snapshot.sku_id);
            let lead_time_days = sku
                .and_then(|sku| sku.default_lead_time_days)
                .unwrap_or(3.0);
            let placed = event
                .and_then(|event| event.placed_quantity)
                .unwrap_or_else(|| {
                    if event.map(|event| event.order_placed).unwrap_or(false) {
                        inventory_gain.max(previous_units * 0.25)
                    } else {
                        0.0
                    }
                });
            let received =
                assign_receipt_quantity(event, lead_time_days, duration_days, inventory_gain);
            let demand = (previous_units + received - snapshot.units_in_stock).max(0.0);
            let next_pipeline = crate::inference::update_pipeline_units(
                pipeline.get(&snapshot.sku_id).copied().unwrap_or(0.0),
                placed,
                received,
            );
            demand_by_sku.insert(snapshot.sku_id.clone(), demand);
            placed_by_sku.insert(snapshot.sku_id.clone(), placed);
            received_by_sku.insert(snapshot.sku_id.clone(), received);
            pipeline_by_sku.insert(snapshot.sku_id.clone(), next_pipeline);
            previous_stock.insert(snapshot.sku_id.clone(), snapshot.units_in_stock);
            pipeline.insert(snapshot.sku_id.clone(), next_pipeline);
        }

        intervals.push(NormalizedInterval {
            interval_index: index,
            start_at,
            end_at: current.reported_at.clone(),
            duration_days,
            demand_by_sku,
            placed_by_sku,
            received_by_sku,
            pipeline_by_sku,
        });
    }

    Ok(intervals)
}
