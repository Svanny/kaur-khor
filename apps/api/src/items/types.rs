use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct CreateItemRequest {
    pub item_id: String,
    pub sku: String,
    pub name: String,
    pub quantity: i64,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct ItemRecord {
    pub owner_sub: String,
    pub item_id: String,
    pub sku: String,
    pub name: String,
    pub quantity: i64,
}

impl CreateItemRequest {
    pub fn validate(&self) -> Result<()> {
        validate_item_id(&self.item_id)?;
        validate_sku(&self.sku)?;
        let trimmed_name = self.name.trim();
        if trimmed_name.is_empty() || trimmed_name.len() > 120 {
            return Err(anyhow!("name must be 1..120 characters after trimming"));
        }
        if !(0..=1_000_000).contains(&self.quantity) {
            return Err(anyhow!("quantity must be within 0..=1000000"));
        }
        Ok(())
    }

    pub fn normalized_name(&self) -> String {
        self.name.trim().to_string()
    }
}

pub fn validate_item_id(item_id: &str) -> Result<()> {
    if !(3..=64).contains(&item_id.len()) {
        return Err(anyhow!("item_id must be 3..64 chars"));
    }
    if !item_id
        .chars()
        .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || matches!(c, '_' | '-'))
    {
        return Err(anyhow!(
            "item_id must contain only lowercase letters, digits, '-' or '_'"
        ));
    }
    Ok(())
}

pub fn validate_sku(sku: &str) -> Result<()> {
    if sku.is_empty() || sku.len() > 64 {
        return Err(anyhow!("sku must be 1..64 chars"));
    }
    if !sku
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
    {
        return Err(anyhow!(
            "sku must contain only alphanumeric chars, '.', '_' or '-'"
        ));
    }
    Ok(())
}
