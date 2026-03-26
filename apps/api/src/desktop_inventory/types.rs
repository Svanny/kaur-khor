use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

const CONTROL_CHARS: &str = "\u{0000}\u{0001}\u{0002}\u{0003}\u{0004}\u{0005}\u{0006}\u{0007}\u{0008}\u{000B}\u{000C}\u{000E}\u{000F}\u{0010}\u{0011}\u{0012}\u{0013}\u{0014}\u{0015}\u{0016}\u{0017}\u{0018}\u{0019}\u{001A}\u{001B}\u{001C}\u{001D}\u{001E}\u{001F}\u{007F}";
const BIDI_CONTROL_CHARS: &str = "\u{202A}\u{202B}\u{202C}\u{202D}\u{202E}\u{2066}\u{2067}\u{2068}\u{2069}";

pub const SKU_NAME_MAX_LENGTH: usize = 80;
pub const SKU_DESCRIPTION_MAX_LENGTH: usize = 250;
pub const SERVICE_NAME_MAX_LENGTH: usize = 80;
pub const SERVICE_DESCRIPTION_MAX_LENGTH: usize = 250;
pub const INVENTORY_UNITS_MAX: f64 = 1_000_000.0;
pub const MONETARY_AMOUNT_MAX: f64 = 1_000_000_000.0;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopSkuRecord {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    pub units_in_stock: f64,
    pub cost_per_unit: f64,
    pub sold_as_product: bool,
    pub product_price: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopServiceRecord {
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub price: f64,
    pub sku_ids: Vec<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum DesktopRankingEntryType {
    Sku,
    Service,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopRankingEntry {
    pub entry_type: DesktopRankingEntryType,
    pub entry_id: String,
    pub position: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DesktopInventoryResponse {
    pub skus: Vec<DesktopSkuRecord>,
    pub services: Vec<DesktopServiceRecord>,
    pub ranking: Vec<DesktopRankingEntry>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDesktopSkuRequest {
    pub sku_id: String,
    pub name: String,
    pub description: String,
    pub units_in_stock: f64,
    pub cost_per_unit: f64,
    pub sold_as_product: bool,
    pub product_price: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertDesktopServiceRequest {
    pub service_id: String,
    pub name: String,
    pub description: String,
    pub price: f64,
    pub sku_ids: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopStockUpdateItem {
    pub sku_id: String,
    pub units_in_stock: f64,
    pub cost_per_unit: f64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyDesktopStockUpdatesRequest {
    pub updates: Vec<DesktopStockUpdateItem>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDesktopRankingRequest {
    pub entries: Vec<DesktopRankingEntry>,
}

impl UpsertDesktopSkuRequest {
    pub fn validate(&mut self) -> Result<()> {
        validate_entry_id("skuId", &self.sku_id)?;
        self.name = normalize_text(&self.name, SKU_NAME_MAX_LENGTH)?;
        self.description = normalize_text(&self.description, SKU_DESCRIPTION_MAX_LENGTH)?;
        validate_non_negative(
            "unitsInStock",
            self.units_in_stock,
            INVENTORY_UNITS_MAX,
        )?;
        validate_non_negative("costPerUnit", self.cost_per_unit, MONETARY_AMOUNT_MAX)?;
        match self.product_price {
            Some(product_price) => {
                validate_non_negative("productPrice", product_price, MONETARY_AMOUNT_MAX)?;
                if !self.sold_as_product {
                    return Err(anyhow!(
                        "productPrice may only be set when soldAsProduct=true"
                    ));
                }
            }
            None => {
                if self.sold_as_product {
                    return Err(anyhow!("productPrice is required when soldAsProduct=true"));
                }
            }
        }
        Ok(())
    }
}

impl UpsertDesktopServiceRequest {
    pub fn validate(&mut self) -> Result<()> {
        validate_entry_id("serviceId", &self.service_id)?;
        self.name = normalize_text(&self.name, SERVICE_NAME_MAX_LENGTH)?;
        self.description = normalize_text(&self.description, SERVICE_DESCRIPTION_MAX_LENGTH)?;
        validate_non_negative("price", self.price, MONETARY_AMOUNT_MAX)?;
        self.sku_ids.sort();
        self.sku_ids.dedup();
        for sku_id in &self.sku_ids {
            validate_entry_id("skuIds", sku_id)?;
        }
        Ok(())
    }
}

impl ApplyDesktopStockUpdatesRequest {
    pub fn validate(&self) -> Result<()> {
        if self.updates.is_empty() {
            return Err(anyhow!("updates must not be empty"));
        }
        for update in &self.updates {
            validate_entry_id("skuId", &update.sku_id)?;
            validate_non_negative("unitsInStock", update.units_in_stock, INVENTORY_UNITS_MAX)?;
            validate_non_negative("costPerUnit", update.cost_per_unit, MONETARY_AMOUNT_MAX)?;
        }
        Ok(())
    }
}

impl SaveDesktopRankingRequest {
    pub fn validate(&self) -> Result<()> {
        if self.entries.is_empty() {
            return Err(anyhow!("entries must not be empty"));
        }
        let mut seen_ids = std::collections::HashSet::new();
        let mut seen_positions = std::collections::HashSet::new();
        for entry in &self.entries {
            validate_entry_id("entryId", &entry.entry_id)?;
            let key = format!("{:?}:{}", entry.entry_type, entry.entry_id);
            if !seen_ids.insert(key) {
                return Err(anyhow!("ranking entries must be unique"));
            }
            if !seen_positions.insert(entry.position) {
                return Err(anyhow!("ranking positions must be unique"));
            }
        }
        Ok(())
    }
}

pub fn normalize_text(input: &str, max_length: usize) -> Result<String> {
    let mut normalized = String::with_capacity(input.len());
    let mut last_was_space = false;

    for ch in input.trim().chars() {
        if CONTROL_CHARS.contains(ch) || BIDI_CONTROL_CHARS.contains(ch) {
            return Err(anyhow!("text fields must not contain control characters"));
        }
        if ch.is_whitespace() {
            if !last_was_space {
                normalized.push(' ');
                last_was_space = true;
            }
            continue;
        }
        normalized.push(ch);
        last_was_space = false;
    }

    if normalized.is_empty() {
        return Err(anyhow!("text fields are required"));
    }
    if normalized.len() > max_length {
        return Err(anyhow!("text fields must be at most {max_length} characters"));
    }
    Ok(normalized)
}

pub fn validate_entry_id(field_name: &str, value: &str) -> Result<()> {
    if !(3..=64).contains(&value.len()) {
        return Err(anyhow!("{field_name} must be 3..64 characters"));
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_lowercase() || ch.is_ascii_digit() || matches!(ch, '-' | '_'))
    {
        return Err(anyhow!(
            "{field_name} must contain only lowercase letters, digits, '-' or '_'"
        ));
    }
    Ok(())
}

pub fn validate_non_negative(field_name: &str, value: f64, max_value: f64) -> Result<()> {
    if !value.is_finite() {
        return Err(anyhow!("{field_name} must be a finite number"));
    }
    if value < 0.0 {
        return Err(anyhow!("{field_name} cannot be negative"));
    }
    if value > max_value {
        return Err(anyhow!("{field_name} must be at most {max_value}"));
    }
    Ok(())
}
