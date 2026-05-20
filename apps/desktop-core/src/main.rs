use anyhow::{anyhow, Context, Result};
use kaur_khor_desktop_core::{benchmark, store};
use kaur_khor_sena_core::{
    SenaCatalog, SenaCreateOrderBatchPayload, SenaEngineParameters, SenaObservationInput,
    SenaObservationPageRequest, SenaObservationRecord, SenaOrderLookupPayload,
    SenaSplitOrderChildPayload, SenaUpdateOrderBatchPayload, SenaUpdateOrderChildPayload,
};
use serde::Deserialize;
use serde::Serialize;
use serde_json::Value;
use std::io::{self, BufRead, Write};

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

        let response = handle_line(&line);
        write_response(&mut stdout, response)?;
    }

    Ok(())
}

fn handle_line(line: &str) -> ResponseEnvelope {
    let envelope: CommandEnvelope =
        match serde_json::from_str(line).context("failed to decode desktop core command") {
            Ok(envelope) => envelope,
            Err(error) => {
                return ResponseEnvelope {
                    id: 0,
                    ok: false,
                    payload: None,
                    error: Some(error.to_string()),
                };
            }
        };
    match handle_command(&envelope.command, envelope.payload) {
        Ok(payload) => ResponseEnvelope {
            id: envelope.id,
            ok: true,
            payload,
            error: None,
        },
        Err(error) => ResponseEnvelope {
            id: envelope.id,
            ok: false,
            payload: None,
            error: Some(error.to_string()),
        },
    }
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
        "sena.getAnalysisArtifact" => {
            let request: RunLookupPayload = serde_json::from_value(payload)
                .context("invalid sena.getAnalysisArtifact payload")?;
            Ok(Some(serde_json::to_value(store::get_analysis_artifact(
                &request.run_id,
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
    use super::{handle_command_inner, handle_line};
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
        env::temp_dir().join(format!("kaur-khor-desktop-core-{label}-{nonce}.sqlite3"))
    }

    fn with_temp_store<T>(label: &str, task: impl FnOnce() -> T) -> T {
        let _guard = env_lock().lock().expect("env lock should be available");
        let previous = env::var_os("KAUR_KHOR_DESKTOP_DATA_PATH");
        env::set_var("KAUR_KHOR_DESKTOP_DATA_PATH", temp_store_path(label));
        let result = task();
        if let Some(value) = previous {
            env::set_var("KAUR_KHOR_DESKTOP_DATA_PATH", value);
        } else {
            env::remove_var("KAUR_KHOR_DESKTOP_DATA_PATH");
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
    fn command_errors_preserve_request_id_and_mark_failed_runs() {
        with_temp_store("trigger-run-one-observation", || {
            handle_command_inner(
                "sena.upsertCatalog",
                serde_json::json!({
                    "schemaVersion": 1,
                    "skus": [{
                        "skuId": "sku-1",
                        "name": "Razor refill",
                        "description": "Refill pack",
                        "supplierName": null,
                        "costPerUnit": 4.0,
                        "soldAsProduct": true,
                        "productPrice": 9.0,
                        "leadTimeMeanDaysHint": 5.0,
                        "leadTimeStdDaysHint": 1.0
                    }],
                    "services": [],
                    "bundles": [],
                    "sharingMask": []
                }),
            )
            .expect("catalog should upsert");
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
                    "retailSalesSnapshot": [],
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

            let response = handle_line(
                r#"{"id":42,"command":"sena.triggerRun","payload":{"algorithmVersion":"sena-analysis-v3"}}"#,
            );

            assert_eq!(response.id, 42);
            assert!(!response.ok);
            assert_eq!(
                response.error.as_deref(),
                Some("SENA analysis requires at least two observations")
            );

            let workspace = handle_command_inner("sena.getStartupWorkspace", Value::Null)
                .expect("startup command should succeed")
                .expect("startup command should return a payload");
            assert_eq!(workspace["latestRun"]["status"], "failed");
            assert_eq!(
                workspace["latestRun"]["error"],
                "SENA analysis requires at least two observations"
            );
        });
    }

    #[test]
    fn retry_run_uses_original_run_algorithm() {
        with_temp_store("retry-run-original-algorithm", || {
            handle_command_inner(
                "sena.upsertCatalog",
                serde_json::json!({
                    "schemaVersion": 1,
                    "skus": [{
                        "skuId": "sku-1",
                        "name": "Razor refill",
                        "description": "Refill pack",
                        "supplierName": null,
                        "costPerUnit": 4.0,
                        "soldAsProduct": true,
                        "productPrice": 9.0,
                        "leadTimeMeanDaysHint": 5.0,
                        "leadTimeStdDaysHint": 1.0
                    }],
                    "services": [],
                    "bundles": [],
                    "sharingMask": []
                }),
            )
            .expect("catalog should upsert");
            for (observed_at, units_in_stock) in [
                ("2026-04-02T00:00:00Z", 12.0),
                ("2026-04-03T00:00:00Z", 10.0),
            ] {
                handle_command_inner(
                    "sena.ingestObservation",
                    serde_json::json!({
                        "observedAt": observed_at,
                        "stockSnapshot": [{
                            "skuId": "sku-1",
                            "unitsInStock": units_in_stock,
                            "costPerUnit": 4.0,
                            "productPrice": 9.0
                        }],
                        "retailSalesSnapshot": [],
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
            }

            let completed = handle_command_inner(
                "sena.triggerRun",
                serde_json::json!({"algorithmVersion": "sena-analysis-v2"}),
            )
            .expect("v2 run should succeed")
            .expect("v2 run should return a payload");
            let run_id = completed["runId"]
                .as_str()
                .expect("completed run should have an id")
                .to_string();
            assert_eq!(completed["algorithmVersion"], "sena-analysis-v2");

            let retried =
                handle_command_inner("sena.retryRun", serde_json::json!({ "runId": run_id }))
                    .expect("retry should succeed")
                    .expect("retry should return a payload");
            assert_eq!(retried["algorithmVersion"], "sena-analysis-v2");
            assert_eq!(
                retried["primaryArtifactKey"],
                "sena-analysis/desktop-owner/sena-analysis-v2/posterior-draws"
            );
        });
    }

    #[test]
    fn retry_run_uses_original_run_parameters() {
        with_temp_store("retry-run-original-parameters", || {
            handle_command_inner(
                "sena.upsertCatalog",
                serde_json::json!({
                    "schemaVersion": 1,
                    "skus": [{
                        "skuId": "sku-1",
                        "name": "Razor refill",
                        "description": "Refill pack",
                        "supplierName": null,
                        "costPerUnit": 4.0,
                        "soldAsProduct": true,
                        "productPrice": 9.0,
                        "leadTimeMeanDaysHint": 5.0,
                        "leadTimeStdDaysHint": 1.0
                    }],
                    "services": [],
                    "bundles": [],
                    "sharingMask": []
                }),
            )
            .expect("catalog should upsert");
            for (observed_at, units_in_stock) in [
                ("2026-04-02T00:00:00Z", 12.0),
                ("2026-04-03T00:00:00Z", 10.0),
            ] {
                handle_command_inner(
                    "sena.ingestObservation",
                    serde_json::json!({
                        "observedAt": observed_at,
                        "stockSnapshot": [{
                            "skuId": "sku-1",
                            "unitsInStock": units_in_stock,
                            "costPerUnit": 4.0,
                            "productPrice": 9.0
                        }],
                        "retailSalesSnapshot": [],
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
            }

            let completed = handle_command_inner(
                "sena.triggerRun",
                serde_json::json!({
                    "algorithmVersion": "sena-analysis-v3",
                    "parameters": {
                        "particleCount": 64,
                        "targetServiceLevel": 0.8,
                        "recommendationQuantile": 0.7,
                        "intervalLowQuantile": 0.2,
                        "intervalHighQuantile": 0.8,
                        "needProbabilityGate": 0.4,
                        "reviewDelayDays": 3.0,
                        "smoothingEnabled": true
                    }
                }),
            )
            .expect("parameterized run should succeed")
            .expect("parameterized run should return a payload");
            let run_id = completed["runId"]
                .as_str()
                .expect("completed run should have an id")
                .to_string();
            assert_eq!(completed["engineParameters"]["smoothingEnabled"], true);

            let retried =
                handle_command_inner("sena.retryRun", serde_json::json!({ "runId": run_id }))
                    .expect("retry should succeed")
                    .expect("retry should return a payload");
            assert_eq!(retried["engineParameters"]["smoothingEnabled"], true);
            assert_eq!(retried["engineParameters"]["particleCount"], 64);
            assert_eq!(retried["diagnostics"]["smoothingEnabled"], true);
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
            assert_eq!(
                page["observations"][0]["input"]["stockSnapshot"][0]["skuId"],
                "sku-1"
            );

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
