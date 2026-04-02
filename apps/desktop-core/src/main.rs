use anyhow::{Context, Result};
use banji_desktop_core::{
    service,
    types::{
        SenaObservationIngestRequest, SenaServiceMaskUpdateRequest, SenaUpsertServiceRequest,
        SenaUpsertSkuRequest,
    },
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::{self, BufRead, Write};
use std::time::Instant;

const DEFAULT_OWNER_SUB: &str = "desktop-owner";

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
struct SaveSkuPayload {
    sku: SenaUpsertSkuRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveServicePayload {
    service: SenaUpsertServiceRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateServiceMaskPayload {
    mask: SenaServiceMaskUpdateRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecordObservationPayload {
    observation: SenaObservationIngestRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetSkuPayload {
    sku_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetServicePayload {
    service_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetRunPayload {
    run_id: String,
}

fn core_trace_enabled() -> bool {
    match std::env::var("BANJI_DESKTOP_TRACE_STORE") {
        Ok(value) => matches!(
            value.to_ascii_lowercase().as_str(),
            "1" | "true" | "yes" | "on"
        ),
        Err(_) => false,
    }
}

fn trace_core(message: &str) {
    if core_trace_enabled() {
        eprintln!("[banji-desktop-core] {message}");
    }
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
    let started_at = Instant::now();
    trace_core(&format!(
        "command-start id={} command={} payload_kind={}",
        envelope.id,
        envelope.command,
        payload_kind(&envelope.payload)
    ));
    let result = handle_command(&envelope.command, envelope.payload)
        .map(|payload| ResponseEnvelope {
            id: envelope.id,
            ok: true,
            payload,
            error: None,
        })
        .unwrap_or_else(|error| ResponseEnvelope {
            id: envelope.id,
            ok: false,
            payload: None,
            error: Some(error.to_string()),
        });
    trace_core(&format!(
        "command-end id={} command={} ok={} elapsed_ms={}",
        result.id,
        envelope.command,
        result.ok,
        started_at.elapsed().as_millis()
    ));
    Ok(result)
}

fn payload_kind(payload: &Value) -> &'static str {
    match payload {
        Value::Null => "null",
        Value::Bool(_) => "bool",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn handle_command(command: &str, payload: Value) -> Result<Option<Value>> {
    match command {
        "system.ping" => Ok(None),
        "sena.getWorkspace" => Ok(Some(serde_json::to_value(service::load_workspace(
            DEFAULT_OWNER_SUB,
        )?)?)),
        "sena.upsertSku" => {
            let request: SaveSkuPayload =
                serde_json::from_value(payload).context("invalid sena.upsertSku payload")?;
            Ok(Some(serde_json::to_value(service::upsert_sku(
                DEFAULT_OWNER_SUB,
                request.sku,
            )?)?))
        }
        "sena.upsertService" => {
            let request: SaveServicePayload =
                serde_json::from_value(payload).context("invalid sena.upsertService payload")?;
            Ok(Some(serde_json::to_value(service::upsert_service(
                DEFAULT_OWNER_SUB,
                request.service,
            )?)?))
        }
        "sena.updateServiceMask" => {
            let request: UpdateServiceMaskPayload = serde_json::from_value(payload)
                .context("invalid sena.updateServiceMask payload")?;
            Ok(Some(serde_json::to_value(service::update_service_mask(
                DEFAULT_OWNER_SUB,
                request.mask,
            )?)?))
        }
        "sena.recordObservation" => {
            let request: RecordObservationPayload = serde_json::from_value(payload)
                .context("invalid sena.recordObservation payload")?;
            Ok(Some(serde_json::to_value(service::record_observation(
                DEFAULT_OWNER_SUB,
                request.observation,
            )?)?))
        }
        "sena.triggerAnalysis" => Ok(Some(serde_json::to_value(service::trigger_analysis(
            DEFAULT_OWNER_SUB,
        )?)?)),
        "sena.getSkuPosterior" => {
            let request: GetSkuPayload =
                serde_json::from_value(payload).context("invalid sena.getSkuPosterior payload")?;
            Ok(Some(serde_json::to_value(service::load_sku_posterior(
                DEFAULT_OWNER_SUB,
                &request.sku_id,
            )?)?))
        }
        "sena.getServicePosterior" => {
            let request: GetServicePayload = serde_json::from_value(payload)
                .context("invalid sena.getServicePosterior payload")?;
            Ok(Some(serde_json::to_value(
                service::load_service_posterior(DEFAULT_OWNER_SUB, &request.service_id)?,
            )?))
        }
        "sena.getDiagnostics" => Ok(Some(serde_json::to_value(service::load_diagnostics(
            DEFAULT_OWNER_SUB,
        )?)?)),
        "sena.getRun" => {
            let request: GetRunPayload =
                serde_json::from_value(payload).context("invalid sena.getRun payload")?;
            Ok(Some(serde_json::to_value(service::load_run(
                DEFAULT_OWNER_SUB,
                &request.run_id,
            )?)?))
        }
        other => anyhow::bail!("unsupported command: {other}"),
    }
}

fn write_response(stdout: &mut impl Write, response: ResponseEnvelope) -> Result<()> {
    serde_json::to_writer(&mut *stdout, &response)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}
