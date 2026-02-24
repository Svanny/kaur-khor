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
    let endpoint = cfg
        .otlp_endpoint
        .as_ref()
        .ok_or_else(|| anyhow!("OTEL enabled but OTEL_EXPORTER_OTLP_ENDPOINT is missing"))?
        .to_string();
    let headers = cfg
        .otlp_headers
        .as_ref()
        .ok_or_else(|| anyhow!("OTEL enabled but OTEL_EXPORTER_OTLP_HEADERS is missing"))?
        .to_string();

    let resource = build_resource(cfg);
    let metadata = parse_otlp_headers(&headers)?;

    let trace_exporter = opentelemetry_otlp::new_exporter()
        .tonic()
        .with_endpoint(endpoint.clone())
        .with_metadata(metadata.clone());
    let tracer = opentelemetry_otlp::new_pipeline()
        .tracing()
        .with_trace_config(trace::config().with_resource(resource.clone()))
        .with_exporter(trace_exporter)
        .install_batch(opentelemetry_sdk::runtime::Tokio)
        .context("failed to install OTLP trace pipeline")?;

    let metrics_exporter = opentelemetry_otlp::new_exporter()
        .tonic()
        .with_endpoint(endpoint)
        .with_metadata(metadata);
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
    traces_sampler_arg: String,
    metrics_export_interval_ms: u64,
}

impl ObservabilityConfig {
    fn from_env() -> Result<Self> {
        let otel_enabled = parse_bool("OTEL_ENABLED", false)?;

        let otlp_endpoint = env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
            .ok()
            .or_else(|| env::var("OTEL_ENDPOINT").ok());
        let otlp_headers = env::var("OTEL_EXPORTER_OTLP_HEADERS")
            .ok()
            .or_else(|| env::var("OTEL_HEADERS").ok());

        let service_name = env::var("OTEL_SERVICE_NAME").unwrap_or_else(|_| {
            let system = env::var("BANJI_SYSTEM").unwrap_or_else(|_| "banji-core".to_string());
            let env_name = env::var("BANJI_ENV").unwrap_or_else(|_| "dev".to_string());
            let region = env::var("BANJI_REGION").unwrap_or_else(|_| "kh-pp".to_string());
            let service = env::var("BANJI_SERVICE").unwrap_or_else(|_| "api".to_string());
            format!("{system}-{env_name}-{region}-{service}")
        });

        let metrics_export_interval_ms = match env::var("OTEL_METRICS_EXPORT_INTERVAL")
            .or_else(|_| env::var("OTEL_METRIC_EXPORT_INTERVAL"))
        {
            Ok(raw) => raw
                .parse::<u64>()
                .context("OTEL_METRICS_EXPORT_INTERVAL must be an integer")?
                .max(1_000),
            Err(_) => 30_000,
        };

        Ok(Self {
            otel_enabled,
            otlp_endpoint,
            otlp_headers,
            service_name,
            traces_sampler: env::var("OTEL_TRACES_SAMPLER")
                .unwrap_or_else(|_| "parentbased_traceidratio".to_string()),
            traces_sampler_arg: env::var("OTEL_TRACES_SAMPLER_ARG")
                .unwrap_or_else(|_| "1.0".to_string()),
            metrics_export_interval_ms,
        })
    }
}

fn build_resource(cfg: &ObservabilityConfig) -> Resource {
    let system = env::var("BANJI_SYSTEM").unwrap_or_else(|_| "banji-core".to_string());
    let env_name = env::var("BANJI_ENV").unwrap_or_else(|_| "dev".to_string());
    let region = env::var("BANJI_REGION").unwrap_or_else(|_| "kh-pp".to_string());
    let deployment_id = env::var("BANJI_DEPLOYMENT_ID").unwrap_or_else(|_| "unknown".to_string());

    let mut attributes = vec![
        KeyValue::new("service.name", cfg.service_name.clone()),
        KeyValue::new("service.namespace", system.clone()),
        KeyValue::new("deployment.environment", env_name.clone()),
        KeyValue::new("deployment.id", deployment_id),
        KeyValue::new("cloud.region", region.clone()),
        KeyValue::new("banji.system", system),
        KeyValue::new("banji.env", env_name),
        KeyValue::new("banji.region", region),
        KeyValue::new("otel.traces.sampler", cfg.traces_sampler.clone()),
        KeyValue::new("otel.traces.sampler_arg", cfg.traces_sampler_arg.clone()),
    ];

    if let Ok(extra_attrs) = env::var("OTEL_RESOURCE_ATTRIBUTES") {
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

fn parse_bool(name: &str, default: bool) -> Result<bool> {
    match env::var(name) {
        Ok(v) => match v.to_ascii_lowercase().as_str() {
            "1" | "true" | "yes" => Ok(true),
            "0" | "false" | "no" => Ok(false),
            _ => Err(anyhow!("{name} must be boolean")),
        },
        Err(_) => Ok(default),
    }
}
