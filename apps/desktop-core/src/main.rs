use anyhow::{Context, Result};
use banji_desktop_core::{
    store,
    types::{
        ApplyDesktopStockUpdatesRequest, DesktopInventoryResponse, SaveDesktopRankingRequest,
        StockReportRecord, SubmitStockReportRequest, UpdateSistSettingsRequest, UpsertDesktopServiceRequest,
        UpsertDesktopSkuRequest,
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
    sku: UpsertDesktopSkuRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveServicePayload {
    service: UpsertDesktopServiceRequest,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetSistSkuDetailPayload {
    sku_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GetSistServiceDetailPayload {
    service_id: String,
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
        "inventory.getSnapshot" => {
            Ok(Some(serde_json::to_value(store::load_inventory(DEFAULT_OWNER_SUB)?)?))
        }
        "inventory.listStockReports" => Ok(Some(serde_json::to_value(
            store::list_stock_reports(DEFAULT_OWNER_SUB)?,
        )?)),
        "inventory.saveSku" => {
            let mut request: SaveSkuPayload =
                serde_json::from_value(payload).context("invalid saveSku payload")?;
            request.sku.validate()?;

            let snapshot = store::load_inventory(DEFAULT_OWNER_SUB)?;
            if snapshot.skus.iter().any(|sku| sku.sku_id == request.sku.sku_id) {
                let sku_id = request.sku.sku_id.clone();
                store::update_sku(DEFAULT_OWNER_SUB, &sku_id, request.sku)?;
            } else {
                store::create_sku(DEFAULT_OWNER_SUB, request.sku)?;
            }

            inventory_snapshot()
        }
        "inventory.saveService" => {
            let mut request: SaveServicePayload =
                serde_json::from_value(payload).context("invalid saveService payload")?;
            request.service.validate()?;

            let snapshot = store::load_inventory(DEFAULT_OWNER_SUB)?;
            if snapshot
                .services
                .iter()
                .any(|service| service.service_id == request.service.service_id)
            {
                let service_id = request.service.service_id.clone();
                store::update_service(
                    DEFAULT_OWNER_SUB,
                    &service_id,
                    request.service,
                )?;
            } else {
                store::create_service(DEFAULT_OWNER_SUB, request.service)?;
            }

            inventory_snapshot()
        }
        "inventory.applyStockUpdates" => {
            let request: ApplyDesktopStockUpdatesRequest =
                serde_json::from_value(payload).context("invalid applyStockUpdates payload")?;
            request.validate()?;
            store::apply_stock_updates(DEFAULT_OWNER_SUB, request)?;
            inventory_snapshot()
        }
        "inventory.submitStockReport" => {
            let mut request: SubmitStockReportRequest =
                serde_json::from_value(payload).context("invalid submitStockReport payload")?;
            request.validate()?;
            store::submit_stock_report(DEFAULT_OWNER_SUB, request)?;
            inventory_snapshot()
        }
        "inventory.saveRanking" => {
            let request: SaveDesktopRankingRequest =
                serde_json::from_value(payload).context("invalid saveRanking payload")?;
            request.validate()?;
            store::save_ranking(DEFAULT_OWNER_SUB, request)?;
            inventory_snapshot()
        }
        "inventory.getSistSkuDetail" => {
            let request: GetSistSkuDetailPayload =
                serde_json::from_value(payload).context("invalid getSistSkuDetail payload")?;
            Ok(Some(serde_json::to_value(store::load_sku_detail(
                DEFAULT_OWNER_SUB,
                &request.sku_id,
            )?)?))
        }
        "inventory.getSistServiceDetail" => {
            let request: GetSistServiceDetailPayload =
                serde_json::from_value(payload).context("invalid getSistServiceDetail payload")?;
            Ok(Some(serde_json::to_value(store::load_service_detail(
                DEFAULT_OWNER_SUB,
                &request.service_id,
            )?)?))
        }
        "inventory.getSistSystemDetail" => Ok(Some(serde_json::to_value(
            store::load_system_detail(DEFAULT_OWNER_SUB)?,
        )?)),
        "inventory.updateSistSettings" => {
            let request: UpdateSistSettingsRequest =
                serde_json::from_value(payload).context("invalid updateSistSettings payload")?;
            request.validate()?;
            store::update_sist_settings(DEFAULT_OWNER_SUB, request)?;
            inventory_snapshot()
        }
        other => anyhow::bail!("unknown desktop core command '{other}'"),
    }
}

fn inventory_snapshot() -> Result<Option<Value>> {
    Ok(Some(serde_json::to_value(
        store::load_inventory(DEFAULT_OWNER_SUB)?,
    )?))
}

fn write_response(stdout: &mut impl Write, response: ResponseEnvelope) -> Result<()> {
    serde_json::to_writer(&mut *stdout, &response)?;
    stdout.write_all(b"\n")?;
    stdout.flush()?;
    Ok(())
}

#[allow(dead_code)]
fn _assert_snapshot_serializable(snapshot: &DesktopInventoryResponse) -> Result<Value> {
    Ok(serde_json::to_value(snapshot)?)
}

#[allow(dead_code)]
fn _assert_stock_reports_serializable(reports: &[StockReportRecord]) -> Result<Value> {
    Ok(serde_json::to_value(reports)?)
}
