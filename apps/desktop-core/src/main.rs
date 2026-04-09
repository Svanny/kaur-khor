use anyhow::{anyhow, Context, Result};
use banji_desktop_core::legacy_inventory::types::SubmitStockReportRequest;
use banji_desktop_core::store;
use banji_sena_core::{SenaCatalog, SenaEngineParameters, SenaObservationInput, SenaObservationRecord};
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
                    .filter(|observation: &&SenaObservationRecord| observation.observation_id != request.observation_id)
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
        "sena.listObservations" => Ok(Some(serde_json::to_value(store::list_observations(
            owner,
        )?)?)),
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
