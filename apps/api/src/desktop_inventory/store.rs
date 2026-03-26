use super::types::{
    ApplyDesktopStockUpdatesRequest, DesktopInventoryResponse, DesktopRankingEntry,
    DesktopRankingEntryType, DesktopServiceRecord, DesktopSkuRecord, SaveDesktopRankingRequest,
    UpsertDesktopServiceRequest, UpsertDesktopSkuRequest,
};
use anyhow::{anyhow, Context, Result};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    env, fs,
    path::{Path, PathBuf},
    sync::Mutex,
};

static STORE_LOCK: Lazy<Mutex<()>> = Lazy::new(|| Mutex::new(()));

#[derive(Debug, Default, Serialize, Deserialize)]
struct DesktopInventoryStore {
    owners: HashMap<String, OwnerInventory>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct OwnerInventory {
    skus: Vec<DesktopSkuRecord>,
    services: Vec<DesktopServiceRecord>,
    ranking: Vec<DesktopRankingEntry>,
}

impl OwnerInventory {
    fn seeded() -> Self {
        let skus = vec![
            DesktopSkuRecord {
                sku_id: "sku-001".to_string(),
                name: "SKU #001".to_string(),
                description: "Base ingredient for high volume items.".to_string(),
                units_in_stock: 264.0,
                cost_per_unit: 1296.0 / 264.0,
                sold_as_product: true,
                product_price: Some(10.0),
            },
            DesktopSkuRecord {
                sku_id: "sku-002".to_string(),
                name: "SKU #002".to_string(),
                description: "Reusable material with stable demand.".to_string(),
                units_in_stock: 146.0,
                cost_per_unit: 601.2 / 146.0,
                sold_as_product: false,
                product_price: None,
            },
            DesktopSkuRecord {
                sku_id: "sku-003".to_string(),
                name: "SKU #003".to_string(),
                description: "Low-rotation backup stock.".to_string(),
                units_in_stock: 76.0,
                cost_per_unit: 592.0 / 76.0,
                sold_as_product: true,
                product_price: Some(16.0),
            },
            DesktopSkuRecord {
                sku_id: "sku-004".to_string(),
                name: "SKU #004".to_string(),
                description: "Seasonal inventory reserved for peak periods.".to_string(),
                units_in_stock: 98.0,
                cost_per_unit: 931.0 / 98.0,
                sold_as_product: false,
                product_price: None,
            },
        ];
        let services = vec![
            DesktopServiceRecord {
                service_id: "service-001".to_string(),
                name: "Service #001".to_string(),
                description: "Basic package for recurring customers.".to_string(),
                price: 1200.0,
                sku_ids: vec!["sku-001".to_string(), "sku-002".to_string()],
            },
            DesktopServiceRecord {
                service_id: "service-002".to_string(),
                name: "Service #002".to_string(),
                description: "Premium package with deeper SKU usage.".to_string(),
                price: 2200.0,
                sku_ids: vec!["sku-002".to_string(), "sku-003".to_string()],
            },
        ];
        let ranking = build_default_ranking(&skus, &services);
        Self {
            skus,
            services,
            ranking,
        }
    }
}

pub fn load_inventory(owner_sub: &str) -> Result<DesktopInventoryResponse> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        if owner.ranking.is_empty() {
            owner.ranking = build_default_ranking(&owner.skus, &owner.services);
        }
        Ok(DesktopInventoryResponse {
            skus: owner.skus.clone(),
            services: owner.services.clone(),
            ranking: owner.ranking.clone(),
        })
    })
}

pub fn create_sku(owner_sub: &str, request: UpsertDesktopSkuRequest) -> Result<DesktopSkuRecord> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        if owner.skus.iter().any(|sku| sku.sku_id == request.sku_id) {
            return Err(anyhow!("sku already exists"));
        }
        let record = DesktopSkuRecord {
            sku_id: request.sku_id,
            name: request.name,
            description: request.description,
            units_in_stock: request.units_in_stock,
            cost_per_unit: request.cost_per_unit,
            sold_as_product: request.sold_as_product,
            product_price: request.product_price,
        };
        owner.skus.push(record.clone());
        owner.ranking = normalize_ranking(&owner.ranking, &owner.skus, &owner.services);
        Ok(record)
    })
}

pub fn update_sku(
    owner_sub: &str,
    sku_id: &str,
    request: UpsertDesktopSkuRequest,
) -> Result<DesktopSkuRecord> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        let existing_index = owner
            .skus
            .iter()
            .position(|sku| sku.sku_id == sku_id)
            .ok_or_else(|| anyhow!("sku not found"))?;
        owner.skus[existing_index] = DesktopSkuRecord {
            sku_id: sku_id.to_string(),
            name: request.name,
            description: request.description,
            units_in_stock: request.units_in_stock,
            cost_per_unit: request.cost_per_unit,
            sold_as_product: request.sold_as_product,
            product_price: request.product_price,
        };
        let valid_sku_ids = owner
            .skus
            .iter()
            .map(|sku| sku.sku_id.clone())
            .collect::<HashSet<_>>();
        for service in &mut owner.services {
            service.sku_ids.retain(|linked_sku_id| valid_sku_ids.contains(linked_sku_id));
        }
        owner.ranking = normalize_ranking(&owner.ranking, &owner.skus, &owner.services);
        Ok(owner.skus[existing_index].clone())
    })
}

pub fn create_service(
    owner_sub: &str,
    request: UpsertDesktopServiceRequest,
) -> Result<DesktopServiceRecord> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        validate_service_links(owner, &request.sku_ids)?;
        if owner
            .services
            .iter()
            .any(|service| service.service_id == request.service_id)
        {
            return Err(anyhow!("service already exists"));
        }
        let record = DesktopServiceRecord {
            service_id: request.service_id,
            name: request.name,
            description: request.description,
            price: request.price,
            sku_ids: request.sku_ids,
        };
        owner.services.push(record.clone());
        owner.ranking = normalize_ranking(&owner.ranking, &owner.skus, &owner.services);
        Ok(record)
    })
}

pub fn update_service(
    owner_sub: &str,
    service_id: &str,
    request: UpsertDesktopServiceRequest,
) -> Result<DesktopServiceRecord> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        validate_service_links(owner, &request.sku_ids)?;
        let existing_index = owner
            .services
            .iter()
            .position(|service| service.service_id == service_id)
            .ok_or_else(|| anyhow!("service not found"))?;
        owner.services[existing_index] = DesktopServiceRecord {
            service_id: service_id.to_string(),
            name: request.name,
            description: request.description,
            price: request.price,
            sku_ids: request.sku_ids,
        };
        owner.ranking = normalize_ranking(&owner.ranking, &owner.skus, &owner.services);
        Ok(owner.services[existing_index].clone())
    })
}

pub fn apply_stock_updates(
    owner_sub: &str,
    request: ApplyDesktopStockUpdatesRequest,
) -> Result<Vec<DesktopSkuRecord>> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        let update_ids = request
            .updates
            .iter()
            .map(|update| update.sku_id.as_str())
            .collect::<HashSet<_>>();
        if !update_ids
            .iter()
            .all(|sku_id| owner.skus.iter().any(|sku| sku.sku_id == *sku_id))
        {
            return Err(anyhow!("all stock updates must target existing skus"));
        }
        let updates_by_id = request
            .updates
            .into_iter()
            .map(|update| (update.sku_id.clone(), update))
            .collect::<HashMap<_, _>>();
        let mut updated = Vec::new();
        for sku in &mut owner.skus {
            if let Some(update) = updates_by_id.get(&sku.sku_id) {
                sku.units_in_stock = update.units_in_stock;
                sku.cost_per_unit = update.cost_per_unit;
                updated.push(sku.clone());
            }
        }
        Ok(updated)
    })
}

pub fn load_ranking(owner_sub: &str) -> Result<Vec<DesktopRankingEntry>> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        owner.ranking = normalize_ranking(&owner.ranking, &owner.skus, &owner.services);
        Ok(owner.ranking.clone())
    })
}

pub fn save_ranking(
    owner_sub: &str,
    request: SaveDesktopRankingRequest,
) -> Result<Vec<DesktopRankingEntry>> {
    with_store_mut(|store| {
        let owner = store
            .owners
            .entry(owner_sub.to_string())
            .or_insert_with(OwnerInventory::seeded);
        validate_ranking_entries(owner, &request.entries)?;
        let mut entries = request.entries;
        entries.sort_by_key(|entry| entry.position);
        owner.ranking = entries;
        Ok(owner.ranking.clone())
    })
}

fn validate_service_links(owner: &OwnerInventory, sku_ids: &[String]) -> Result<()> {
    for sku_id in sku_ids {
        if !owner.skus.iter().any(|sku| &sku.sku_id == sku_id) {
            return Err(anyhow!("service references unknown sku '{sku_id}'"));
        }
    }
    Ok(())
}

fn validate_ranking_entries(owner: &OwnerInventory, entries: &[DesktopRankingEntry]) -> Result<()> {
    let valid_service_ids = owner
        .services
        .iter()
        .map(|service| service.service_id.as_str())
        .collect::<HashSet<_>>();
    let valid_ranked_sku_ids = owner
        .skus
        .iter()
        .filter(|sku| sku.sold_as_product && sku.product_price.is_some())
        .map(|sku| sku.sku_id.as_str())
        .collect::<HashSet<_>>();
    let expected_entries = build_default_ranking(&owner.skus, &owner.services);
    let expected_keys = expected_entries
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.as_str()))
        .collect::<HashSet<_>>();
    let received_keys = entries
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.as_str()))
        .collect::<HashSet<_>>();

    for entry in entries {
        match entry.entry_type {
            DesktopRankingEntryType::Service => {
                if !valid_service_ids.contains(entry.entry_id.as_str()) {
                    return Err(anyhow!("ranking references unknown service '{}'", entry.entry_id));
                }
            }
            DesktopRankingEntryType::Sku => {
                if !valid_ranked_sku_ids.contains(entry.entry_id.as_str()) {
                    return Err(anyhow!(
                        "ranking references unknown or unrankable sku '{}'",
                        entry.entry_id
                    ));
                }
            }
        }
    }

    if received_keys != expected_keys {
        return Err(anyhow!("ranking must contain every rankable service and sku exactly once"));
    }

    Ok(())
}

fn normalize_ranking(
    ranking: &[DesktopRankingEntry],
    skus: &[DesktopSkuRecord],
    services: &[DesktopServiceRecord],
) -> Vec<DesktopRankingEntry> {
    let default = build_default_ranking(skus, services);
    if ranking.is_empty() {
        return default;
    }

    let valid = default
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.as_str()))
        .collect::<HashSet<_>>();

    let mut retained = ranking
        .iter()
        .filter(|entry| valid.contains(&(entry.entry_type, entry.entry_id.as_str())))
        .cloned()
        .collect::<Vec<_>>();
    retained.sort_by_key(|entry| entry.position);

    let retained_keys = retained
        .iter()
        .map(|entry| (entry.entry_type, entry.entry_id.clone()))
        .collect::<HashSet<_>>();

    for entry in default {
        if !retained_keys.contains(&(entry.entry_type, entry.entry_id.clone())) {
            retained.push(entry);
        }
    }

    for (index, entry) in retained.iter_mut().enumerate() {
        entry.position = index;
    }

    retained
}

fn build_default_ranking(
    skus: &[DesktopSkuRecord],
    services: &[DesktopServiceRecord],
) -> Vec<DesktopRankingEntry> {
    let mut entries = Vec::new();
    for service in services {
        entries.push(DesktopRankingEntry {
            entry_type: DesktopRankingEntryType::Service,
            entry_id: service.service_id.clone(),
            position: entries.len(),
        });
    }
    for sku in skus {
        if sku.sold_as_product && sku.product_price.is_some() {
            entries.push(DesktopRankingEntry {
                entry_type: DesktopRankingEntryType::Sku,
                entry_id: sku.sku_id.clone(),
                position: entries.len(),
            });
        }
    }
    entries
}

fn store_path() -> PathBuf {
    if let Ok(path) = env::var("BANJI_DESKTOP_DATA_PATH") {
        return PathBuf::from(path);
    }
    env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join("build")
        .join("desktop-inventory-store.json")
}

fn with_store_mut<T>(f: impl FnOnce(&mut DesktopInventoryStore) -> Result<T>) -> Result<T> {
    let _guard = STORE_LOCK.lock().expect("desktop inventory lock poisoned");
    let path = store_path();
    let mut store = load_store(&path)?;
    let result = f(&mut store)?;
    save_store(&path, &store)?;
    Ok(result)
}

fn load_store(path: &Path) -> Result<DesktopInventoryStore> {
    if !path.exists() {
        return Ok(DesktopInventoryStore::default());
    }
    let raw = fs::read_to_string(path)
        .with_context(|| format!("failed to read desktop inventory store at {}", path.display()))?;
    if raw.trim().is_empty() {
        return Ok(DesktopInventoryStore::default());
    }
    serde_json::from_str(&raw)
        .with_context(|| format!("failed to parse desktop inventory store at {}", path.display()))
}

fn save_store(path: &Path, store: &DesktopInventoryStore) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("failed to create store directory {}", parent.display()))?;
    }
    let tmp_path = path.with_extension("tmp");
    let contents = serde_json::to_vec_pretty(store)?;
    fs::write(&tmp_path, contents)
        .with_context(|| format!("failed to write temporary store file {}", tmp_path.display()))?;
    fs::rename(&tmp_path, path)
        .with_context(|| format!("failed to replace store file {}", path.display()))?;
    Ok(())
}
