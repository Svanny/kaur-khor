use anyhow::{anyhow, Context, Result};
use opentelemetry::{global, propagation::TextMapPropagator, KeyValue};
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::{
    propagation::{BaggagePropagator, TextMapCompositePropagator, TraceContextPropagator},
    trace, Resource,
};
use std::{env, time::Duration};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub struct TelemetryGuard {
    otel_enabled: bool,
}

impl TelemetryGuard {
    pub fn shutdown(&self) {
        if self.otel_enabled {
            global::shutdown_tracer_provider();
        }
    }
}

pub fn init() -> Result<TelemetryGuard> {
    let propagators: Vec<Box<dyn TextMapPropagator + Send + Sync>> = vec![
        Box::new(TraceContextPropagator::new()),
        Box::new(BaggagePropagator::new()),
    ];
    global::set_text_map_propagator(TextMapCompositePropagator::new(propagators));

    let cfg = ObservabilityConfig::from_env()?;
    if cfg.otel_enabled {
        init_with_otel(&cfg)?;
    } else {
        init_logs_only()?;
    }

    Ok(TelemetryGuard {
        otel_enabled: cfg.otel_enabled,
    })
}

fn init_logs_only() -> Result<()> {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .or_else(|_| EnvFilter::try_new("info,banji_api=debug"))
                .context("invalid RUST_LOG")?,
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .compact(),
        )
        .try_init()
        .context("failed to initialize tracing subscriber")
}

fn init_with_otel(cfg: &ObservabilityConfig) -> Result<()> {
    let resource = build_resource(cfg);
    let metadata = cfg
        .otlp_headers
        .as_deref()
        .map(parse_otlp_headers)
        .transpose()?;

    let trace_exporter = {
        let exporter = opentelemetry_otlp::new_exporter().tonic();
        let exporter = if let Some(endpoint) = cfg.otlp_endpoint.as_deref() {
            exporter.with_endpoint(endpoint.to_string())
        } else {
            exporter
        };
        if let Some(metadata) = metadata.clone() {
            exporter.with_metadata(metadata)
        } else {
            exporter
        }
    };
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_trace_config(
            trace::config()
                .with_sampler(build_trace_sampler(
                    &cfg.traces_sampler,
                    cfg.traces_sampler_arg.as_deref(),
                ))
                .with_resource(resource.clone()),
        )
        .with_exporter(trace_exporter)
        .install_batch(opentelemetry_sdk::runtime::Tokio)
        .context("failed to install OTLP trace pipeline")?;

    let metrics_exporter = {
        let exporter = opentelemetry_otlp::new_exporter().tonic();
        let exporter = if let Some(endpoint) = cfg.otlp_endpoint.as_deref() {
            exporter.with_endpoint(endpoint.to_string())
        } else {
            exporter
        };
        if let Some(metadata) = metadata {
            exporter.with_metadata(metadata)
        } else {
            exporter
        }
    };
    let meter_provider = opentelemetry_otlp::new_pipeline()
        .metrics(opentelemetry_sdk::runtime::Tokio)
        .with_exporter(metrics_exporter)
        .with_resource(resource)
        .with_period(Duration::from_millis(cfg.metrics_export_interval_ms))
        .build()
        .context("failed to install OTLP metrics pipeline")?;
    global::set_meter_provider(meter_provider);

    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .or_else(|_| EnvFilter::try_new("info,banji_api=debug"))
                .context("invalid RUST_LOG")?,
        )
        .with(
            tracing_subscriber::fmt::layer()
                .with_target(false)
                .compact(),
        )
        .with(tracing_opentelemetry::layer().with_tracer(tracer))
        .try_init()
        .context("failed to initialize tracing + otel subscriber")
}

#[derive(Debug, Clone)]
struct ObservabilityConfig {
    otel_enabled: bool,
    otlp_endpoint: Option<String>,
    otlp_headers: Option<String>,
    service_name: String,
    traces_sampler: String,
    traces_sampler_arg: Option<String>,
    metrics_export_interval_ms: u64,
}

impl ObservabilityConfig {
    fn from_env() -> Result<Self> {
        let otel_enabled = parse_bool("OTEL_ENABLED", false)?;

        let otlp_endpoint = optional_trimmed_env("OTEL_EXPORTER_OTLP_ENDPOINT")
            .or_else(|| optional_trimmed_env("OTEL_ENDPOINT"));
        let otlp_headers = optional_trimmed_env("OTEL_EXPORTER_OTLP_HEADERS")
            .or_else(|| optional_trimmed_env("OTEL_HEADERS"));
        let service_name =
            optional_trimmed_env("OTEL_SERVICE_NAME").unwrap_or_else(default_service_name);

        let metrics_export_interval_ms = match optional_trimmed_env("OTEL_METRIC_EXPORT_INTERVAL")
            .or_else(|| optional_trimmed_env("OTEL_METRICS_EXPORT_INTERVAL"))
        {
            Some(raw) => raw
                .parse::<u64>()
                .context("OTEL_METRIC_EXPORT_INTERVAL must be an integer")?
                .max(1_000),
            None => 30_000,
        };
        let (traces_sampler, traces_sampler_arg) = normalize_trace_sampler_config(
            optional_trimmed_env("OTEL_TRACES_SAMPLER").as_deref(),
            optional_trimmed_env("OTEL_TRACES_SAMPLER_ARG").as_deref(),
        );

        Ok(Self {
            otel_enabled,
            otlp_endpoint,
            otlp_headers,
            service_name,
            traces_sampler,
            traces_sampler_arg,
            metrics_export_interval_ms,
        })
    }
}

fn build_resource(cfg: &ObservabilityConfig) -> Resource {
    let system = env::var("BANJI_SYSTEM").unwrap_or_else(|_| "banji-core".to_string());
    let env_name = env::var("BANJI_ENV").unwrap_or_else(|_| "dev".to_string());
    let region = env::var("BANJI_REGION").unwrap_or_else(|_| "kh-pp".to_string());
    let deployment_id = env::var("BANJI_DEPLOYMENT_ID").unwrap_or_else(|_| "unknown".to_string());
    let instance_id = resolve_instance_id();

    let mut attributes = vec![
        KeyValue::new("service.name", cfg.service_name.clone()),
        KeyValue::new("service.instance.id", instance_id),
        KeyValue::new("service.namespace", system.clone()),
        KeyValue::new("deployment.environment", env_name.clone()),
        KeyValue::new("deployment.id", deployment_id),
        KeyValue::new("cloud.region", region.clone()),
        KeyValue::new("banji.system", system),
        KeyValue::new("banji.env", env_name),
        KeyValue::new("banji.region", region),
        KeyValue::new("otel.traces.sampler", cfg.traces_sampler.clone()),
    ];

    if let Some(traces_sampler_arg) = cfg.traces_sampler_arg.as_ref() {
        attributes.push(KeyValue::new(
            "otel.traces.sampler_arg",
            traces_sampler_arg.clone(),
        ));
    }

    if let Some(extra_attrs) = optional_trimmed_env("OTEL_RESOURCE_ATTRIBUTES") {
        for pair in extra_attrs.split(',') {
            let mut parts = pair.splitn(2, '=');
            let Some(key) = parts.next().map(str::trim).filter(|s| !s.is_empty()) else {
                continue;
            };
            let Some(value) = parts.next().map(str::trim) else {
                continue;
            };
            attributes.push(KeyValue::new(key.to_string(), value.to_string()));
        }
    }

    Resource::new(attributes)
}

fn resolve_instance_id() -> String {
    env::var("BANJI_INSTANCE_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| {
            env::var("HOSTNAME")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            env::var("COMPUTERNAME")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .or_else(|| {
            env::var("RAILWAY_REPLICA_ID")
                .ok()
                .filter(|value| !value.trim().is_empty())
        })
        .unwrap_or_else(|| "unknown-instance".to_string())
}

fn parse_otlp_headers(input: &str) -> Result<tonic::metadata::MetadataMap> {
    let mut metadata = tonic::metadata::MetadataMap::new();
    for pair in input.split(',') {
        let pair = pair.trim();
        if pair.is_empty() {
            continue;
        }
        let mut parts = pair.splitn(2, '=');
        let key = parts
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .ok_or_else(|| anyhow!("invalid OTEL header entry"))?;
        let value = parts
            .next()
            .map(str::trim)
            .ok_or_else(|| anyhow!("invalid OTEL header entry"))?;

        let key = tonic::metadata::MetadataKey::from_bytes(key.as_bytes())
            .context("invalid OTEL header key")?;
        let value =
            tonic::metadata::MetadataValue::try_from(value).context("invalid OTEL header value")?;
        metadata.insert(key, value);
    }
    Ok(metadata)
}

fn optional_trimmed_env(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

fn default_service_name() -> String {
    let system = env::var("BANJI_SYSTEM").unwrap_or_else(|_| "banji-core".to_string());
    let env_name = env::var("BANJI_ENV").unwrap_or_else(|_| "dev".to_string());
    let region = env::var("BANJI_REGION").unwrap_or_else(|_| "kh-pp".to_string());
    let service = crate::config::resolve_service_name_with_fallback();
    format!("{system}-{env_name}-{region}-{service}")
}

fn normalize_trace_sampler_config(
    raw_sampler: Option<&str>,
    raw_sampler_arg: Option<&str>,
) -> (String, Option<String>) {
    let fallback = || ("parentbased_always_on".to_string(), None);
    match raw_sampler.unwrap_or("parentbased_always_on") {
        "always_on" => ("always_on".to_string(), None),
        "always_off" => ("always_off".to_string(), None),
        "traceidratio" => (
            "traceidratio".to_string(),
            Some(normalize_trace_sampler_ratio(raw_sampler_arg)),
        ),
        "parentbased_always_on" => ("parentbased_always_on".to_string(), None),
        "parentbased_always_off" => ("parentbased_always_off".to_string(), None),
        "parentbased_traceidratio" => (
            "parentbased_traceidratio".to_string(),
            Some(normalize_trace_sampler_ratio(raw_sampler_arg)),
        ),
        "parentbased_jaeger_remote" | "jaeger_remote" | "xray" => fallback(),
        _ => fallback(),
    }
}

fn normalize_trace_sampler_ratio(raw_sampler_arg: Option<&str>) -> String {
    raw_sampler_arg
        .filter(|value| value.parse::<f64>().is_ok())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "1.0".to_string())
}

fn build_trace_sampler(name: &str, arg: Option<&str>) -> trace::Sampler {
    match name {
        "always_on" => trace::Sampler::AlwaysOn,
        "always_off" => trace::Sampler::AlwaysOff,
        "traceidratio" => {
            trace::Sampler::TraceIdRatioBased(arg.unwrap_or("1.0").parse::<f64>().unwrap_or(1.0))
        }
        "parentbased_always_off" => {
            trace::Sampler::ParentBased(Box::new(trace::Sampler::AlwaysOff))
        }
        "parentbased_traceidratio" => trace::Sampler::ParentBased(Box::new(
            trace::Sampler::TraceIdRatioBased(arg.unwrap_or("1.0").parse::<f64>().unwrap_or(1.0)),
        )),
        _ => trace::Sampler::ParentBased(Box::new(trace::Sampler::AlwaysOn)),
    }
}

fn parse_bool(name: &str, default: bool) -> Result<bool> {
    match optional_trimmed_env(name) {
        Some(v) => match v.to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" => Ok(true),
            "0" | "false" | "no" => Ok(false),
            _ => Err(anyhow!("{name} must be boolean")),
        },
        None => Ok(default),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        default_service_name, parse_otlp_headers, resolve_instance_id, ObservabilityConfig,
    };
    use std::sync::{Mutex, OnceLock};

    fn env_lock() -> &'static Mutex<()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
    }

    fn clear_env(names: &[&str]) {
        for name in names {
            unsafe {
                std::env::remove_var(name);
            }
        }
    }

    fn observability_env_names() -> &'static [&'static str] {
        &[
            "OTEL_ENABLED",
            "OTEL_EXPORTER_OTLP_ENDPOINT",
            "OTEL_ENDPOINT",
            "OTEL_EXPORTER_OTLP_HEADERS",
            "OTEL_HEADERS",
            "OTEL_SERVICE_NAME",
            "OTEL_RESOURCE_ATTRIBUTES",
            "OTEL_TRACES_SAMPLER",
            "OTEL_TRACES_SAMPLER_ARG",
            "OTEL_METRIC_EXPORT_INTERVAL",
            "OTEL_METRICS_EXPORT_INTERVAL",
            "BANJI_SYSTEM",
            "BANJI_ENV",
            "BANJI_REGION",
            "BANJI_SERVICE",
            "APP_ROLE",
        ]
    }

    #[test]
    fn instance_id_prefers_explicit_env_var() {
        let _guard = env_lock().lock().unwrap();
        unsafe {
            std::env::set_var("BANJI_INSTANCE_ID", "api-1");
            std::env::remove_var("HOSTNAME");
        }
        assert_eq!(resolve_instance_id(), "api-1");
        unsafe {
            std::env::remove_var("BANJI_INSTANCE_ID");
        }
    }

    #[test]
    fn instance_id_falls_back_to_unknown() {
        let _guard = env_lock().lock().unwrap();
        unsafe {
            std::env::remove_var("BANJI_INSTANCE_ID");
            std::env::remove_var("HOSTNAME");
            std::env::remove_var("COMPUTERNAME");
            std::env::remove_var("RAILWAY_REPLICA_ID");
        }
        assert_eq!(resolve_instance_id(), "unknown-instance");
    }

    #[test]
    fn blank_otel_service_name_uses_default_service_name() {
        let _guard = env_lock().lock().unwrap();
        clear_env(observability_env_names());
        unsafe {
            std::env::set_var("BANJI_SYSTEM", "banji-core");
            std::env::set_var("BANJI_ENV", "staging");
            std::env::set_var("BANJI_REGION", "kh-pp");
            std::env::set_var("APP_ROLE", "event-relay");
            std::env::set_var("OTEL_SERVICE_NAME", "   ");
        }

        let cfg = ObservabilityConfig::from_env().unwrap();
        assert_eq!(cfg.service_name, default_service_name());
        assert_eq!(cfg.service_name, "banji-core-staging-kh-pp-event-relay");
    }

    #[test]
    fn blank_otlp_headers_are_treated_as_absent() {
        let _guard = env_lock().lock().unwrap();
        clear_env(observability_env_names());
        unsafe {
            std::env::set_var("OTEL_EXPORTER_OTLP_HEADERS", "   ");
            std::env::set_var("OTEL_HEADERS", "");
        }

        let cfg = ObservabilityConfig::from_env().unwrap();
        assert_eq!(cfg.otlp_headers, None);
    }

    #[test]
    fn blank_otlp_endpoint_is_treated_as_absent() {
        let _guard = env_lock().lock().unwrap();
        clear_env(observability_env_names());
        unsafe {
            std::env::set_var("OTEL_EXPORTER_OTLP_ENDPOINT", "   ");
            std::env::set_var("OTEL_ENDPOINT", "");
        }

        let cfg = ObservabilityConfig::from_env().unwrap();
        assert_eq!(cfg.otlp_endpoint, None);
    }

    #[test]
    fn singular_metric_export_interval_takes_precedence() {
        let _guard = env_lock().lock().unwrap();
        clear_env(observability_env_names());
        unsafe {
            std::env::set_var("OTEL_METRIC_EXPORT_INTERVAL", "5000");
            std::env::set_var("OTEL_METRICS_EXPORT_INTERVAL", "6000");
        }

        let cfg = ObservabilityConfig::from_env().unwrap();
        assert_eq!(cfg.metrics_export_interval_ms, 5_000);
    }

    #[test]
    fn invalid_non_empty_otlp_headers_still_error() {
        assert!(parse_otlp_headers("authorization").is_err());
    }
}
