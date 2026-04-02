use crate::types::{
    SenaObservationIngestRequest, SenaServiceMaskUpdateRequest, SenaUpsertServiceRequest,
    SenaUpsertSkuRequest,
};
use anyhow::{anyhow, Result};
use std::collections::HashSet;
use time::{format_description::well_known::Rfc3339, OffsetDateTime};

const TEXT_MAX: usize = 240;

fn validate_id(name: &str, value: &str) -> Result<()> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(anyhow!("{name} must not be empty"));
    }
    if trimmed.len() > 80 {
        return Err(anyhow!("{name} must be <= 80 characters"));
    }
    if !trimmed
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
    {
        return Err(anyhow!(
            "{name} may only contain ASCII letters, digits, '-' and '_'"
        ));
    }
    Ok(())
}

fn validate_text(name: &str, value: &str) -> Result<()> {
    if value.trim().is_empty() {
        return Err(anyhow!("{name} must not be empty"));
    }
    if value.len() > TEXT_MAX {
        return Err(anyhow!("{name} must be <= {TEXT_MAX} characters"));
    }
    Ok(())
}

fn validate_non_negative(name: &str, value: f64) -> Result<()> {
    if !value.is_finite() || value < 0.0 {
        return Err(anyhow!("{name} must be a finite non-negative number"));
    }
    Ok(())
}

fn validate_probability(name: &str, value: f64) -> Result<()> {
    if !value.is_finite() || !(0.0..=1.0).contains(&value) {
        return Err(anyhow!("{name} must be between 0 and 1"));
    }
    Ok(())
}

pub fn validate_sku_request(request: &SenaUpsertSkuRequest) -> Result<()> {
    validate_id("skuId", &request.sku_id)?;
    validate_text("name", &request.name)?;
    validate_text("description", &request.description)?;
    validate_non_negative("unitsPerRetailSale", request.units_per_retail_sale)?;
    validate_non_negative("currentStockUnits", request.current_stock_units)?;
    validate_probability(
        "reorderTargetServiceLevel",
        request.reorder_target_service_level,
    )?;
    if let Some(days) = request.default_lead_time_days {
        validate_non_negative("defaultLeadTimeDays", days)?;
    }
    if let Some(value) = request.default_lead_time_variability {
        validate_non_negative("defaultLeadTimeVariability", value)?;
    }
    Ok(())
}

pub fn validate_service_request(request: &SenaUpsertServiceRequest) -> Result<()> {
    validate_id("serviceId", &request.service_id)?;
    validate_text("name", &request.name)?;
    validate_text("description", &request.description)?;
    validate_non_negative("basePrice", request.base_price)?;
    let mut seen = HashSet::new();
    for link in &request.recipe_links {
        validate_id("recipeLinks[].skuId", &link.sku_id)?;
        validate_probability("recipeLinks[].usageProbability", link.usage_probability)?;
        if !seen.insert(link.sku_id.clone()) {
            return Err(anyhow!("recipeLinks must not contain duplicate skuIds"));
        }
    }
    Ok(())
}

pub fn validate_service_mask_request(request: &SenaServiceMaskUpdateRequest) -> Result<()> {
    validate_id("serviceId", &request.service_id)?;
    let mut seen = HashSet::new();
    for link in &request.recipe_links {
        validate_id("recipeLinks[].skuId", &link.sku_id)?;
        validate_probability("recipeLinks[].usageProbability", link.usage_probability)?;
        if !seen.insert(link.sku_id.clone()) {
            return Err(anyhow!("recipeLinks must not contain duplicate skuIds"));
        }
    }
    Ok(())
}

pub fn validate_observation_request(request: &SenaObservationIngestRequest) -> Result<()> {
    validate_id("observationId", &request.observation_id)?;
    OffsetDateTime::parse(&request.reported_at, &Rfc3339)
        .map_err(|_| anyhow!("reportedAt must be RFC3339"))?;
    if request.sku_snapshots.is_empty() {
        return Err(anyhow!("skuSnapshots must not be empty"));
    }
    let mut seen_skus = HashSet::new();
    for snapshot in &request.sku_snapshots {
        validate_id("skuSnapshots[].skuId", &snapshot.sku_id)?;
        validate_non_negative("skuSnapshots[].unitsInStock", snapshot.units_in_stock)?;
        if !seen_skus.insert(snapshot.sku_id.clone()) {
            return Err(anyhow!("skuSnapshots must not contain duplicate skuIds"));
        }
    }
    for service_id in &request.top_service_ranking {
        validate_id("topServiceRanking[]", service_id)?;
    }
    for sku_id in &request.top_retail_ranking {
        validate_id("topRetailRanking[]", sku_id)?;
    }
    for service_id in &request.service_stockouts {
        validate_id("serviceStockouts[]", service_id)?;
    }
    for sku_id in &request.retail_stockouts {
        validate_id("retailStockouts[]", sku_id)?;
    }
    for event in &request.order_events {
        validate_id("orderEvents[].skuId", &event.sku_id)?;
        if let Some(quantity) = event.placed_quantity {
            validate_non_negative("orderEvents[].placedQuantity", quantity)?;
        }
        if let Some(quantity) = event.received_quantity {
            validate_non_negative("orderEvents[].receivedQuantity", quantity)?;
        }
    }
    for observation in &request.service_prices {
        validate_id("servicePrices[].serviceId", &observation.service_id)?;
        validate_non_negative("servicePrices[].price", observation.price)?;
    }
    for observation in &request.retail_prices {
        validate_id("retailPrices[].skuId", &observation.sku_id)?;
        validate_non_negative("retailPrices[].price", observation.price)?;
    }
    for hint in &request.lead_time_hints {
        validate_id("leadTimeHints[].skuId", &hint.sku_id)?;
        if let Some(days) = hint.typical_days {
            validate_non_negative("leadTimeHints[].typicalDays", days)?;
        }
        if let Some(days) = hint.low_days {
            validate_non_negative("leadTimeHints[].lowDays", days)?;
        }
        if let Some(days) = hint.high_days {
            validate_non_negative("leadTimeHints[].highDays", days)?;
        }
        if let (Some(low), Some(high)) = (hint.low_days, hint.high_days) {
            if high < low {
                return Err(anyhow!(
                    "leadTimeHints[].highDays must be >= leadTimeHints[].lowDays"
                ));
            }
        }
    }
    Ok(())
}
