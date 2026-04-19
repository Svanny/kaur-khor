use anyhow::{anyhow, Context, Result};
use banji_desktop_core::legacy_inventory::types::SubmitStockReportRequest;
use banji_desktop_core::store;
use banji_sena_core::{
    SenaCatalog, SenaCreateOrderBatchPayload, SenaEngineParameters, SenaObservationInput,
    SenaObservationPageRequest, SenaObservationRecord, SenaOrderLookupPayload,
    SenaSplitOrderChildPayload, SenaUpdateOrderBatchPayload, SenaUpdateOrderChildPayload,
};
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::io::{self, BufRead, Write};

mod benchmark;

#[derive(Debug, Deserialize)]
struct CommandEnvelope {
    id: u64,
    command: String,
    #[serde(default)]
    payload: Value,
}

#[derive(Debug, Serialize)]
struct ResponseEnvelope {
    id: u64,
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    payload: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TriggerRunPayload {
    #[serde(default = "default_algorithm_version")]
    algorithm_version: String,
    #[serde(default)]
    parameters: Option<SenaEngineParameters>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RunLookupPayload {
    run_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkuLookupPayload {
    sku_id: String,
    #[serde(default)]
    before_interval_index: Option<usize>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ServiceLookupPayload {
    service_id: String,
    #[serde(default)]
    before_interval_index: Option<usize>,
    #[serde(default)]
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ObservationLookupPayload {
    observation_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateObservationPayload {
    observation_id: String,
    input: SenaObservationInput,
}

fn default_algorithm_version() -> String {
    "sena-analysis-v3".to_string()
}

fn main() -> Result<()> {
    let stdin = io::stdin();
    let mut stdout = io::stdout().lock();

    for line in stdin.lock().lines() {
        let line = match line {
            Ok(line) => line,
            Err(error) => {
                write_response(
                    &mut stdout,
                    ResponseEnvelope {
                        id: 0,
                        ok: false,
                        payload: None,
                        error: Some(format!("failed to read command: {error}")),
                    },
                )?;
                continue;
            }
        };

        if line.trim().is_empty() {
            continue;
        }

        let response = match handle_line(&line) {
            Ok(response) => response,
            Err(error) => ResponseEnvelope {
                id: 0,
                ok: false,
                payload: None,
                error: Some(error.to_string()),
            },
        };
        write_response(&mut stdout, response)?;
    }

    Ok(())
}

fn handle_line(line: &str) -> Result<ResponseEnvelope> {
    let envelope: CommandEnvelope =
        serde_json::from_str(line).context("failed to decode desktop core command")?;
    let payload = handle_command(&envelope.command, envelope.payload)?;
    Ok(ResponseEnvelope {
        id: envelope.id,
        ok: true,
        payload,
        error: None,
    })
}

fn handle_command(command: &str, payload: Value) -> Result<Option<Value>> {
    let payload_summary = benchmark::summarize_value(&payload);
    benchmark::time_command(command, payload_summary, || {
        handle_command_inner(command, payload)
    })
}

fn handle_command_inner(command: &str, payload: Value) -> Result<Option<Value>> {
    let owner = store::default_owner();
    match command {
        "system.ping" => Ok(None),
        "sena.seedDevWorkspace" => Ok(Some(serde_json::to_value(store::ensure_dev_seed(owner)?)?)),
        "sena.upsertCatalog" => {
            let catalog: SenaCatalog =
                serde_json::from_value(payload).context("invalid sena.upsertCatalog payload")?;
            catalog.validate()?;
            store::upsert_catalog(owner, &catalog)?;
            Ok(Some(serde_json::to_value(catalog)?))
        }
        "sena.ingestObservation" => {
            let observation: SenaObservationInput = serde_json::from_value(payload)
                .context("invalid sena.ingestObservation payload")?;
            observation.validate()?;
            if observation.stock_snapshot.is_empty() && store::list_observations(owner)?.is_empty()
            {
                return Err(anyhow!(
                    "first SENA observation must include at least one stock snapshot"
                ));
            }
            Ok(Some(serde_json::to_value(store::ingest_observation(
                owner,
                &observation,
            )?)?))
        }
        "sena.updateObservation" => {
            let request: UpdateObservationPayload = serde_json::from_value(payload)
                .context("invalid sena.updateObservation payload")?;
            request.input.validate()?;
            let existing = store::list_observations(owner)?;
            if request.input.stock_snapshot.is_empty()
                && existing
                    .iter()
                    .filter(|observation: &&SenaObservationRecord| {
                        observation.observation_id != request.observation_id
                    })
                    .count()
                    == 0
            {
                return Err(anyhow!(
                    "first SENA observation must include at least one stock snapshot"
                ));
            }
            Ok(Some(serde_json::to_value(store::update_observation(
                owner,
                &request.observation_id,
                &request.input,
            )?)?))
        }
        "sena.deleteObservation" => {
            let request: ObservationLookupPayload = serde_json::from_value(payload)
                .context("invalid sena.deleteObservation payload")?;
            store::delete_observation(owner, &request.observation_id)?;
            Ok(None)
        }
        "sena.getCatalog" => Ok(Some(serde_json::to_value(store::get_catalog(owner)?)?)),
        "sena.getObservationFingerprint" => Ok(Some(serde_json::to_value(
            store::get_observation_fingerprint(owner)?,
        )?)),
        "sena.getStartupWorkspace" => Ok(Some(serde_json::to_value(
            store::get_startup_workspace(owner)?,
        )?)),
        "sena.getRecordUpdateContext" => Ok(Some(serde_json::to_value(
            store::get_record_update_context(owner)?,
        )?)),
        "sena.listObservationPage" => {
            let request: Option<SenaObservationPageRequest> = if payload.is_null() {
                None
            } else {
                Some(
                    serde_json::from_value(payload)
                        .context("invalid sena.listObservationPage payload")?,
                )
            };
            Ok(Some(serde_json::to_value(store::list_observation_page(
                owner,
                request.as_ref(),
            )?)?))
        }
        "sena.listObservations" => Ok(Some(serde_json::to_value(store::list_observations(
            owner,
        )?)?)),
        "sena.listOrderBatches" => {
            let filters: Option<SenaOrderLookupPayload> = if payload.is_null() {
                None
            } else {
                Some(
                    serde_json::from_value(payload)
                        .context("invalid sena.listOrderBatches payload")?,
                )
            };
            Ok(Some(serde_json::to_value(store::list_order_batches(
                owner,
                filters.as_ref(),
            )?)?))
        }
        "sena.createOrderBatch" => {
            let request: SenaCreateOrderBatchPayload =
                serde_json::from_value(payload).context("invalid sena.createOrderBatch payload")?;
            Ok(Some(serde_json::to_value(store::create_order_batch(
                owner, &request,
            )?)?))
        }
        "sena.updateOrderBatch" => {
            let request: SenaUpdateOrderBatchPayload =
                serde_json::from_value(payload).context("invalid sena.updateOrderBatch payload")?;
            Ok(Some(serde_json::to_value(store::update_order_batch(
                owner, &request,
            )?)?))
        }
        "sena.updateOrderChild" => {
            let request: SenaUpdateOrderChildPayload =
                serde_json::from_value(payload).context("invalid sena.updateOrderChild payload")?;
            Ok(Some(serde_json::to_value(store::update_order_child(
                owner, &request,
            )?)?))
        }
        "sena.splitOrderChild" => {
            let request: SenaSplitOrderChildPayload =
                serde_json::from_value(payload).context("invalid sena.splitOrderChild payload")?;
            Ok(Some(serde_json::to_value(store::split_order_child(
                owner, &request,
            )?)?))
        }
        "sena.triggerRun" => {
            let request: TriggerRunPayload =
                serde_json::from_value(payload).context("invalid sena.triggerRun payload")?;
            Ok(Some(serde_json::to_value(
                store::trigger_run_with_parameters(
                    owner,
                    &request.algorithm_version,
                    request.parameters.as_ref(),
                )?,
            )?))
        }
        "sena.retryRun" => {
            let request: RunLookupPayload =
                serde_json::from_value(payload).context("invalid sena.retryRun payload")?;
            Ok(Some(serde_json::to_value(store::retry_run(
                &request.run_id,
                "sena-analysis-v3",
            )?)?))
        }
        "sena.getWorkspaceSummary" => Ok(Some(serde_json::to_value(
            store::get_workspace_summary(owner)?,
        )?)),
        "sena.getSkuDetail" => {
            let request: SkuLookupPayload =
                serde_json::from_value(payload).context("invalid sena.getSkuDetail payload")?;
            Ok(Some(serde_json::to_value(store::get_sku_detail(
                owner,
                &request.sku_id,
                request.before_interval_index,
                request.limit.unwrap_or(20),
            )?)?))
        }
        "sena.getServiceDetail" => {
            let request: ServiceLookupPayload =
                serde_json::from_value(payload).context("invalid sena.getServiceDetail payload")?;
            Ok(Some(serde_json::to_value(store::get_service_detail(
                owner,
                &request.service_id,
                request.before_interval_index,
                request.limit.unwrap_or(20),
            )?)?))
        }
        "sena.getDiagnostics" => Ok(Some(serde_json::to_value(store::get_diagnostics(owner)?)?)),
        "sena.getRunStatus" => {
            let request: RunLookupPayload =
                serde_json::from_value(payload).context("invalid sena.getRunStatus payload")?;
            Ok(Some(serde_json::to_value(store::get_run(
                &request.run_id,
            )?)?))
        }
        "inventory.loadSnapshot" => Ok(Some(serde_json::to_value(
            store::load_inventory_snapshot(owner)?,
        )?)),
        "inventory.listReports" => Ok(Some(serde_json::to_value(store::list_stock_reports(
            owner,
        )?)?)),
        "inventory.submitReport" => {
            let mut request: SubmitStockReportRequest = serde_json::from_value(payload)
                .context("invalid inventory.submitReport payload")?;
            request.validate()?;
            Ok(Some(serde_json::to_value(store::submit_stock_report(
                owner, request,
            )?)?))
        }
        other => anyhow::bail!("unknown desktop core command '{other}'"),
    }
}

fn write_response(stdout: &mut impl Write, response: ResponseEnvelope) -> Result<()> {
    serde_json::to_writer(&mut *stdout, &response)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::handle_command_inner;
    use serde_json::Value;
    use std::{
        env,
        path::PathBuf,
        sync::{Mutex, OnceLock},
        time::{SystemTime, UNIX_EPOCH},
    };

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn temp_store_path(label: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after epoch")
            .as_nanos();
        env::temp_dir().join(format!("banji-desktop-core-{label}-{nonce}.sqlite3"))
    }

    fn with_temp_store<T>(label: &str, task: impl FnOnce() -> T) -> T {
        let _guard = env_lock().lock().expect("env lock should be available");
        let previous = env::var_os("BANJI_DESKTOP_DATA_PATH");
        env::set_var("BANJI_DESKTOP_DATA_PATH", temp_store_path(label));
        let result = task();
        if let Some(value) = previous {
            env::set_var("BANJI_DESKTOP_DATA_PATH", value);
        } else {
            env::remove_var("BANJI_DESKTOP_DATA_PATH");
        }
        result
    }

    #[test]
    fn observation_fingerprint_command_returns_empty_metadata() {
        with_temp_store("fingerprint-empty", || {
            let value = handle_command_inner("sena.getObservationFingerprint", Value::Null)
                .expect("fingerprint command should succeed")
                .expect("fingerprint should return a payload");
            assert_eq!(value["count"], 0);
            assert!(value["latestObservedAt"].is_null());
            assert!(value["latestObservationId"].is_null());
        });
    }

    #[test]
    fn startup_workspace_command_handles_empty_workspace() {
        with_temp_store("startup-workspace", || {
            let empty = handle_command_inner("sena.getStartupWorkspace", Value::Null)
                .expect("startup command should succeed")
                .expect("startup command should return a payload");
            assert!(empty["catalog"].is_null());
            assert!(empty["workspaceSummary"].is_null());
            assert!(empty["latestRun"].is_null());
            assert_eq!(empty["observationFingerprint"]["count"], 0);
        });
    }

    #[test]
    fn observation_page_and_record_update_context_commands_return_compact_reads() {
        with_temp_store("observation-page-context", || {
            handle_command_inner(
                "sena.ingestObservation",
                serde_json::json!({
                    "observedAt": "2026-04-02T00:00:00Z",
                    "stockSnapshot": [{
                        "skuId": "sku-1",
                        "unitsInStock": 12.0,
                        "costPerUnit": 4.0,
                        "productPrice": 9.0
                    }],
                    "retailSalesSnapshot": [{
                        "skuId": "sku-1",
                        "unitsSold": 2.0
                    }],
                    "serviceSalesSnapshot": [],
                    "serviceRankings": [],
                    "retailRankings": [],
                    "serviceStockouts": [],
                    "retailStockouts": [],
                    "orderSignals": [],
                    "servicePrices": [],
                    "retailPrices": [],
                    "leadTimeHints": [],
                    "notes": null
                }),
            )
            .expect("observation should insert");

            let page = handle_command_inner(
                "sena.listObservationPage",
                serde_json::json!({ "limit": 1 }),
            )
            .expect("page command should succeed")
            .expect("page should return a payload");
            assert_eq!(page["totalCount"], 1);
            assert_eq!(page["observations"][0]["input"]["stockSnapshot"][0]["skuId"], "sku-1");

            let context = handle_command_inner("sena.getRecordUpdateContext", Value::Null)
                .expect("context command should succeed")
                .expect("context should return a payload");
            assert_eq!(context["observationFingerprint"]["count"], 1);
            assert_eq!(
                context["latestStockBySku"]["sku-1"]["value"]["unitsInStock"],
                12.0
            );
            assert_eq!(
                context["latestRetailSaleBySku"]["sku-1"]["value"]["unitsSold"],
                2.0
            );
        });
    }
}
