use crate::lead_time::{derive_relative_width, derive_variability_class, target_std_days};
use crate::types::{
    SenaAnalysisResult, SenaCatalog, SenaDiagnostics, SenaIntervalPosterior,
    SenaLeadTimePosteriorPoint, SenaObservationRecord, SenaPipelinePosteriorPoint,
    SenaRegimePosteriorPoint, SenaReorderQuantityRecommendation, SenaServiceContributor,
    SenaServiceDetail, SenaSkuDetail, SenaSkuSummary, SenaTrajectoryPoint, SenaWorkspaceSummary,
};
use anyhow::{anyhow, Result};
use rand::{rngs::StdRng, Rng, SeedableRng};
#[cfg(feature = "desktop")]
use rayon::{prelude::*, ThreadPool, ThreadPoolBuilder};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
#[cfg(feature = "desktop")]
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    OnceLock,
};
use time::{format_description::well_known::Rfc3339, Month, OffsetDateTime};

const REGIMES: [&str; 6] = [
    "normal",
    "spike",
    "lull",
    "stockout_constrained",
    "promo",
    "correction",
];
const REORDER_RECOMMENDATION_QUANTILE: f64 = 0.70;
const REORDER_INTERVAL_LOW_QUANTILE: f64 = 0.10;
const REORDER_INTERVAL_HIGH_QUANTILE: f64 = 0.90;
const REORDER_NEED_PROBABILITY_GATE: f64 = 0.50;
const REORDER_REVIEW_DELAY_DAYS: f64 = 0.0;
const DEFAULT_TARGET_SERVICE_LEVEL: f64 = 0.95;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaEngineParameters {
    pub particle_count: usize,
    pub target_service_level: f64,
    pub recommendation_quantile: f64,
    pub interval_low_quantile: f64,
    pub interval_high_quantile: f64,
    pub need_probability_gate: f64,
    pub review_delay_days: f64,
    pub smoothing_enabled: bool,
}

impl SenaEngineParameters {
    pub fn for_algorithm(algorithm_version: &str) -> Self {
        Self {
            particle_count: particle_count_for_algorithm(algorithm_version),
            target_service_level: DEFAULT_TARGET_SERVICE_LEVEL,
            recommendation_quantile: REORDER_RECOMMENDATION_QUANTILE,
            interval_low_quantile: REORDER_INTERVAL_LOW_QUANTILE,
            interval_high_quantile: REORDER_INTERVAL_HIGH_QUANTILE,
            need_probability_gate: REORDER_NEED_PROBABILITY_GATE,
            review_delay_days: REORDER_REVIEW_DELAY_DAYS,
            smoothing_enabled: false,
        }
    }

    pub fn normalized_for_algorithm(&self, algorithm_version: &str) -> Self {
        let interval_low_quantile = self.interval_low_quantile.clamp(0.0, 1.0);
        let interval_high_quantile = self
            .interval_high_quantile
            .clamp(interval_low_quantile, 1.0);

        Self {
            particle_count: self.particle_count.clamp(32, 2048),
            target_service_level: self.target_service_level.clamp(0.5, 0.999),
            recommendation_quantile: self.recommendation_quantile.clamp(0.0, 1.0),
            interval_low_quantile,
            interval_high_quantile,
            need_probability_gate: self.need_probability_gate.clamp(0.0, 1.0),
            review_delay_days: self.review_delay_days.clamp(0.0, 365.0),
            smoothing_enabled: self.smoothing_enabled,
        }
        .with_algorithm_defaults(algorithm_version)
    }

    fn with_algorithm_defaults(mut self, algorithm_version: &str) -> Self {
        if self.particle_count == 0 {
            self.particle_count = particle_count_for_algorithm(algorithm_version);
        }
        self
    }

    pub fn is_default_for_algorithm(&self, algorithm_version: &str) -> bool {
        self.normalized_for_algorithm(algorithm_version) == Self::for_algorithm(algorithm_version)
    }
}

impl Default for SenaEngineParameters {
    fn default() -> Self {
        Self::for_algorithm("sena-analysis-v3")
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisArtifacts {
    pub primary_artifact_key: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaInputFingerprint {
    pub algorithm_version: String,
    pub catalog_fingerprint: String,
    pub observation_fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessedInterval {
    index: usize,
    start_at: String,
    end_at: String,
    start_day: f64,
    end_day: f64,
    delta_days: f64,
    day_of_week: usize,
    month_index: usize,
    stock_by_sku: HashMap<String, f64>,
    observed_delta_by_sku: HashMap<String, f64>,
    exact_service_sales_by_service: HashMap<String, f64>,
    exact_retail_sales_by_sku: HashMap<String, f64>,
    service_rank_order: Vec<String>,
    retail_rank_order: Vec<String>,
    service_stockouts: Vec<String>,
    retail_stockouts: Vec<String>,
    order_signal_by_sku: HashMap<String, crate::types::SenaOrderSignal>,
    lead_time_hint_by_sku: HashMap<String, crate::types::SenaLeadTimeHint>,
    centered_service_prices: HashMap<String, f64>,
    centered_retail_prices: HashMap<String, f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct OrderBatch {
    quantity: f64,
    arrival_day: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaParticleState {
    inventory: Vec<f64>,
    order_books: Vec<Vec<OrderBatch>>,
    log_service_rate: Vec<f64>,
    log_retail_rate: Vec<f64>,
    recipe_log_means: Vec<Vec<f64>>,
    log_lead_time_mean: Vec<f64>,
    log_lead_time_variance: Vec<f64>,
    order_alpha: Vec<f64>,
    order_beta: Vec<f64>,
    order_gamma: Vec<f64>,
    order_xi: Vec<f64>,
    age_days: Vec<f64>,
    seasonality_dow: Vec<[f64; 7]>,
    seasonality_month: Vec<[f64; 12]>,
}

type Particle = SenaParticleState;

struct IntervalParticleResult {
    particle_index: usize,
    particle: Particle,
    summary: IntervalSummary,
    log_weight: f64,
}

struct IntervalSummary {
    inventory: Vec<f64>,
    pipeline: Vec<f64>,
    service_demand: Vec<f64>,
    retail_demand: Vec<f64>,
    total_demand: Vec<f64>,
    realized_consumption: Vec<f64>,
    lost_demand: Vec<f64>,
    adjustments: Vec<f64>,
    receipts: Vec<f64>,
    order_probability: Vec<f64>,
    order_quantity: Vec<f64>,
    age_days: Vec<f64>,
    pre_clamp_inventory: Vec<f64>,
    inventory_position: Vec<f64>,
    stockout_hit: Vec<bool>,
    lead_time_mean: Vec<f64>,
    lead_time_variance: Vec<f64>,
    service_counts: Vec<f64>,
    regime: &'static str,
    change_point: bool,
    posterior_abs_error: f64,
    coverage_hits: usize,
    seasonal_magnitude: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaPosteriorSnapshot {
    weights: Vec<f64>,
    inventory: Vec<Vec<f64>>,
    pipeline: Vec<Vec<f64>>,
    demand_rate: Vec<Vec<f64>>,
    lead_time_mean: Vec<Vec<f64>>,
    lead_time_variance: Vec<Vec<f64>>,
    stockout_hit: Vec<Vec<f64>>,
}

type PosteriorSnapshot = SenaPosteriorSnapshot;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreprocessedWorkspace {
    pub initial_inventory: Vec<f64>,
    pub usage_map: Vec<Vec<(usize, f64)>>,
    pub sku_capacity_hints: Vec<f64>,
    pub observation_sigma: Vec<f64>,
    pub intervals: Vec<PreprocessedInterval>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisRuntimeState {
    pub particles: Vec<SenaParticleState>,
    pub ess_values: Vec<f64>,
    pub resampling_count: usize,
    pub regime_history: Vec<SenaRegimePosteriorPoint>,
    pub sku_inventory_traces: Vec<Vec<SenaTrajectoryPoint>>,
    pub sku_interval_traces: Vec<Vec<SenaIntervalPosterior>>,
    pub sku_pipeline_traces: Vec<Vec<SenaPipelinePosteriorPoint>>,
    pub sku_lead_time_traces: Vec<Vec<SenaLeadTimePosteriorPoint>>,
    pub service_activity_series: Vec<Vec<f64>>,
    pub posterior_predictive_error_sum: f64,
    pub coverage_hits: f64,
    pub coverage_total: f64,
    pub seasonality_magnitude_sum: f64,
    pub latest_snapshot: Option<SenaPosteriorSnapshot>,
    pub latest_regime_probabilities: BTreeMap<String, f64>,
    pub latest_change_point_probability: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaCheckpointMetadata {
    pub owner_sub: String,
    pub algorithm_version: String,
    pub catalog_fingerprint: String,
    pub observation_prefix_fingerprint: String,
    pub observation_count: usize,
    pub completed_interval_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SenaAnalysisCheckpoint {
    pub metadata: SenaCheckpointMetadata,
    pub state: SenaAnalysisRuntimeState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct RunAnalysisOutput {
    pub result: SenaAnalysisResult,
    pub artifacts: AnalysisArtifacts,
    pub checkpoints: Vec<SenaAnalysisCheckpoint>,
}

pub fn particle_count_for_algorithm(algorithm_version: &str) -> usize {
    match algorithm_version {
        "sena-analysis-v3" => 256,
        "sena-analysis-v2" => 192,
        _ => 128,
    }
}

#[cfg(feature = "desktop")]
static PARTICLE_WORKER_COUNT: OnceLock<usize> = OnceLock::new();
#[cfg(feature = "desktop")]
static PARTICLE_THREAD_POOL: OnceLock<ThreadPool> = OnceLock::new();
#[cfg(feature = "desktop")]
static PARTICLE_POOL_INIT_COUNT: AtomicUsize = AtomicUsize::new(0);

#[cfg(feature = "desktop")]
fn available_particle_workers() -> usize {
    *PARTICLE_WORKER_COUNT.get_or_init(|| {
        std::thread::available_parallelism()
            .map(usize::from)
            .unwrap_or(1)
            .saturating_sub(2)
            .max(1)
    })
}

#[cfg(feature = "desktop")]
fn particle_thread_pool() -> &'static ThreadPool {
    PARTICLE_THREAD_POOL.get_or_init(|| {
        PARTICLE_POOL_INIT_COUNT.fetch_add(1, Ordering::SeqCst);
        ThreadPoolBuilder::new()
            .num_threads(available_particle_workers())
            .thread_name(|index| format!("sena-particle-{index}"))
            .build()
            .expect("SENA particle thread pool should initialize")
    })
}

#[cfg(test)]
#[cfg(feature = "desktop")]
fn particle_pool_init_count() -> usize {
    PARTICLE_POOL_INIT_COUNT.load(Ordering::SeqCst)
}

#[cfg(feature = "desktop")]
fn particle_batch_ranges(particle_count: usize) -> Vec<(usize, usize)> {
    if particle_count == 0 {
        return Vec::new();
    }
    let worker_count = available_particle_workers().min(particle_count).max(1);
    let base = particle_count / worker_count;
    let remainder = particle_count % worker_count;
    let mut start = 0_usize;
    let mut ranges = Vec::with_capacity(worker_count);
    for worker_index in 0..worker_count {
        let batch_size = base + usize::from(worker_index < remainder);
        let end = start + batch_size;
        if start < end {
            ranges.push((start, end));
        }
        start = end;
    }
    ranges
}

fn particle_seed(
    owner_sub: &str,
    interval_index: usize,
    particle_count: usize,
    particle_index: usize,
) -> u64 {
    stable_seed(&(
        owner_sub,
        interval_index,
        particle_count as u64,
        particle_index as u64,
    ))
}

pub fn fingerprint_value<T: Serialize + ?Sized>(value: &T) -> Result<String> {
    let json = serde_json::to_vec(value)?;
    Ok(format!("{:016x}", stable_seed(&json)))
}

pub fn fingerprint_catalog(catalog: &SenaCatalog) -> Result<String> {
    fingerprint_value(catalog)
}

pub fn fingerprint_observations(observations: &[SenaObservationRecord]) -> Result<String> {
    fingerprint_value(observations)
}

pub fn fingerprint_observation_prefix(
    observations: &[SenaObservationRecord],
    observation_count: usize,
) -> Result<String> {
    fingerprint_value(&observations[..observation_count.min(observations.len())])
}

pub fn build_input_fingerprint(
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    algorithm_version: &str,
) -> Result<SenaInputFingerprint> {
    Ok(SenaInputFingerprint {
        algorithm_version: algorithm_version.to_string(),
        catalog_fingerprint: fingerprint_catalog(catalog)?,
        observation_fingerprint: fingerprint_observations(observations)?,
    })
}

pub fn preprocess_workspace(
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
) -> Result<PreprocessedWorkspace> {
    if observations.len() < 2 {
        return Err(anyhow!("SENA analysis requires at least two observations"));
    }
    let observations = observations_chronological(observations)?;

    let mut sku_index = HashMap::new();
    for (index, sku) in catalog.skus.iter().enumerate() {
        sku_index.insert(sku.sku_id.as_str(), index);
    }
    let mut service_index = HashMap::new();
    for (index, service) in catalog.services.iter().enumerate() {
        service_index.insert(service.service_id.as_str(), index);
    }

    let mut initial_inventory = vec![0.0; catalog.skus.len()];
    for snapshot in &observations[0].input.stock_snapshot {
        if let Some(index) = sku_index.get(snapshot.sku_id.as_str()) {
            initial_inventory[*index] = snapshot.units_in_stock.max(0.0);
        }
    }

    let mut usage_map = vec![Vec::<(usize, f64)>::new(); catalog.services.len()];
    for entry in &catalog.sharing_mask {
        if !entry.enabled {
            continue;
        }
        if let (Some(&service_idx), Some(&sku_idx)) = (
            service_index.get(entry.service_id.as_str()),
            sku_index.get(entry.sku_id.as_str()),
        ) {
            usage_map[service_idx].push((sku_idx, entry.usage_probability.unwrap_or(0.85)));
        }
    }

    let sku_capacity_hints = catalog
        .skus
        .iter()
        .map(|sku| {
            observations
                .iter()
                .flat_map(|observation| observation.input.stock_snapshot.iter())
                .filter(|entry| entry.sku_id == sku.sku_id)
                .map(|entry| entry.units_in_stock)
                .fold(0.0_f64, f64::max)
                .max(12.0)
        })
        .collect::<Vec<_>>();
    let observation_sigma = estimate_observation_sigma(catalog, &observations, &sku_index);
    let intervals = normalize_intervals(&observations)?;

    Ok(PreprocessedWorkspace {
        initial_inventory,
        usage_map,
        sku_capacity_hints,
        observation_sigma,
        intervals,
    })
}

fn observations_chronological(
    observations: &[SenaObservationRecord],
) -> Result<Vec<SenaObservationRecord>> {
    let mut with_times = observations
        .iter()
        .map(|observation| {
            let observed_at = OffsetDateTime::parse(&observation.input.observed_at, &Rfc3339)
                .map_err(|err| anyhow!("invalid observation timestamp: {err}"))?;
            Ok((
                observed_at,
                observation.observation_id.clone(),
                observation.clone(),
            ))
        })
        .collect::<Result<Vec<_>>>()?;
    with_times.sort_by(|left, right| left.0.cmp(&right.0).then_with(|| left.1.cmp(&right.1)));
    Ok(with_times
        .into_iter()
        .map(|(_, _, observation)| observation)
        .collect())
}

fn build_initial_runtime_state(
    catalog: &SenaCatalog,
    preprocessed: &PreprocessedWorkspace,
    particle_count: usize,
    owner_sub: &str,
) -> SenaAnalysisRuntimeState {
    let mut particles = Vec::with_capacity(particle_count);
    for particle_index in 0..particle_count {
        let mut rng =
            StdRng::seed_from_u64(stable_seed(&(owner_sub, "init", particle_index as u64)));
        particles.push(Particle {
            inventory: preprocessed
                .initial_inventory
                .iter()
                .map(|value| {
                    (value + sample_normal(&mut rng) * (value.sqrt() * 0.15 + 1.0)).max(0.0)
                })
                .collect(),
            order_books: vec![Vec::new(); catalog.skus.len()],
            log_service_rate: catalog
                .services
                .iter()
                .map(|_| -1.0 + sample_normal(&mut rng) * 0.25)
                .collect(),
            log_retail_rate: catalog
                .skus
                .iter()
                .map(|sku| {
                    if sku.sold_as_product {
                        -1.2 + sample_normal(&mut rng) * 0.25
                    } else {
                        -6.0
                    }
                })
                .collect(),
            recipe_log_means: preprocessed
                .usage_map
                .iter()
                .map(|links| {
                    links
                        .iter()
                        .map(|(_, usage_probability)| usage_probability.max(0.1).ln())
                        .collect::<Vec<_>>()
                })
                .collect(),
            log_lead_time_mean: catalog
                .skus
                .iter()
                .map(|sku| sku.lead_time_mean_days_hint.unwrap_or(5.0).max(0.5).ln())
                .collect(),
            log_lead_time_variance: catalog
                .skus
                .iter()
                .map(|sku| {
                    let std = sku.lead_time_std_days_hint.unwrap_or(1.5).max(0.25);
                    (std.powi(2)).ln()
                })
                .collect(),
            order_alpha: catalog
                .skus
                .iter()
                .map(|_| -0.7 + sample_normal(&mut rng) * 0.2)
                .collect(),
            order_beta: catalog
                .skus
                .iter()
                .map(|_| -1.0 + sample_normal(&mut rng) * 0.15)
                .collect(),
            order_gamma: catalog
                .skus
                .iter()
                .map(|_| 0.08 + sample_normal(&mut rng) * 0.03)
                .collect(),
            order_xi: catalog
                .skus
                .iter()
                .map(|_| -0.14 + sample_normal(&mut rng) * 0.05)
                .collect(),
            age_days: vec![0.0; catalog.skus.len()],
            seasonality_dow: catalog
                .services
                .iter()
                .map(|_| {
                    let mut effect = [0.0; 7];
                    for value in &mut effect {
                        *value = sample_normal(&mut rng) * 0.03;
                    }
                    effect
                })
                .collect(),
            seasonality_month: catalog
                .services
                .iter()
                .map(|_| {
                    let mut effect = [0.0; 12];
                    for value in &mut effect {
                        *value = sample_normal(&mut rng) * 0.02;
                    }
                    effect
                })
                .collect(),
        });
    }

    SenaAnalysisRuntimeState {
        particles,
        ess_values: Vec::new(),
        resampling_count: 0,
        regime_history: Vec::new(),
        sku_inventory_traces: vec![Vec::new(); catalog.skus.len()],
        sku_interval_traces: vec![Vec::new(); catalog.skus.len()],
        sku_pipeline_traces: vec![Vec::new(); catalog.skus.len()],
        sku_lead_time_traces: vec![Vec::new(); catalog.skus.len()],
        service_activity_series: vec![Vec::new(); catalog.services.len()],
        posterior_predictive_error_sum: 0.0,
        coverage_hits: 0.0,
        coverage_total: 0.0,
        seasonality_magnitude_sum: 0.0,
        latest_snapshot: None,
        latest_regime_probabilities: BTreeMap::new(),
        latest_change_point_probability: 0.0,
    }
}

pub fn build_checkpoint_metadata(
    owner_sub: &str,
    algorithm_version: &str,
    catalog_fingerprint: &str,
    observations: &[SenaObservationRecord],
    completed_interval_count: usize,
) -> Result<SenaCheckpointMetadata> {
    let observation_count = completed_interval_count + 1;
    Ok(SenaCheckpointMetadata {
        owner_sub: owner_sub.to_string(),
        algorithm_version: algorithm_version.to_string(),
        catalog_fingerprint: catalog_fingerprint.to_string(),
        observation_prefix_fingerprint: fingerprint_observation_prefix(
            observations,
            observation_count,
        )?,
        observation_count,
        completed_interval_count,
    })
}

pub fn run_preprocessed_analysis(
    owner_sub: &str,
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    algorithm_version: &str,
    preprocessed: &PreprocessedWorkspace,
    resume_from: Option<&SenaAnalysisCheckpoint>,
    checkpoint_interval: Option<usize>,
) -> Result<RunAnalysisOutput> {
    run_preprocessed_analysis_with_parameters(
        owner_sub,
        catalog,
        observations,
        algorithm_version,
        preprocessed,
        resume_from,
        checkpoint_interval,
        None,
    )
}

#[allow(clippy::too_many_arguments)]
pub fn run_preprocessed_analysis_with_parameters(
    owner_sub: &str,
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    algorithm_version: &str,
    preprocessed: &PreprocessedWorkspace,
    resume_from: Option<&SenaAnalysisCheckpoint>,
    checkpoint_interval: Option<usize>,
    parameters: Option<&SenaEngineParameters>,
) -> Result<RunAnalysisOutput> {
    if observations.len() < 2 {
        return Err(anyhow!("SENA analysis requires at least two observations"));
    }

    let parameters = parameters
        .cloned()
        .unwrap_or_else(|| SenaEngineParameters::for_algorithm(algorithm_version))
        .normalized_for_algorithm(algorithm_version);
    let particle_count = parameters.particle_count;
    let catalog_fingerprint = fingerprint_catalog(catalog)?;
    let mut sku_index = HashMap::new();
    for (index, sku) in catalog.skus.iter().enumerate() {
        sku_index.insert(sku.sku_id.as_str(), index);
    }
    let mut service_index = HashMap::new();
    for (index, service) in catalog.services.iter().enumerate() {
        service_index.insert(service.service_id.as_str(), index);
    }

    let mut state = resume_from
        .map(|checkpoint| checkpoint.state.clone())
        .unwrap_or_else(|| {
            build_initial_runtime_state(catalog, preprocessed, particle_count, owner_sub)
        });
    let start_index = resume_from
        .map(|checkpoint| checkpoint.metadata.completed_interval_count)
        .unwrap_or(0);
    let mut checkpoints = Vec::new();

    for interval in preprocessed.intervals.iter().skip(start_index) {
        let particle_count = state.particles.len();
        let mut results = execute_particle_batches(
            owner_sub,
            interval,
            &state.particles,
            catalog,
            preprocessed,
            &sku_index,
            &service_index,
        );
        results.sort_by_key(|result| result.particle_index);
        let max_log_weight = results
            .iter()
            .map(|result| result.log_weight)
            .fold(f64::NEG_INFINITY, f64::max);

        let raw_weights = results
            .iter()
            .map(|result| {
                (result.log_weight - max_log_weight)
                    .exp()
                    .clamp(1e-12, 1e12)
            })
            .collect::<Vec<_>>();
        let weights = normalize_weights(&raw_weights);
        let ess = effective_sample_size(&weights);
        let should_resample = ess < state.particles.len() as f64 * 0.7;
        state.ess_values.push(ess);

        let mut regime_votes = BTreeMap::new();
        for regime in REGIMES {
            regime_votes.insert(regime.to_string(), 0.0_f64);
        }
        for (result, weight) in results.iter().zip(weights.iter()) {
            *regime_votes
                .entry(result.summary.regime.to_string())
                .or_default() += *weight;
        }
        let dominant_regime = regime_votes
            .iter()
            .max_by(|left, right| {
                left.1
                    .partial_cmp(right.1)
                    .unwrap_or(std::cmp::Ordering::Equal)
            })
            .map(|(regime, _)| regime.clone())
            .unwrap_or_else(|| "normal".to_string());
        let change_point_probability = results
            .iter()
            .zip(weights.iter())
            .map(|(result, weight)| {
                if result.summary.change_point {
                    *weight
                } else {
                    0.0
                }
            })
            .sum::<f64>()
            .clamp(0.0, 1.0);
        state.latest_regime_probabilities = regime_votes.clone();
        state.latest_change_point_probability = change_point_probability;

        for sku_idx in 0..catalog.skus.len() {
            let inventory_samples = results
                .iter()
                .map(|result| result.summary.inventory[sku_idx])
                .collect::<Vec<_>>();
            let pipeline_samples = results
                .iter()
                .map(|result| result.summary.pipeline[sku_idx])
                .collect::<Vec<_>>();
            let lead_time_mean_samples = results
                .iter()
                .map(|result| result.summary.lead_time_mean[sku_idx])
                .collect::<Vec<_>>();
            let lead_time_variance_samples = results
                .iter()
                .map(|result| result.summary.lead_time_variance[sku_idx])
                .collect::<Vec<_>>();
            let service_demand_samples = results
                .iter()
                .map(|result| result.summary.service_demand[sku_idx])
                .collect::<Vec<_>>();
            let retail_demand_samples = results
                .iter()
                .map(|result| result.summary.retail_demand[sku_idx])
                .collect::<Vec<_>>();
            let demand_samples = results
                .iter()
                .map(|result| result.summary.total_demand[sku_idx])
                .collect::<Vec<_>>();
            let realized_consumption_samples = results
                .iter()
                .map(|result| result.summary.realized_consumption[sku_idx])
                .collect::<Vec<_>>();
            let lost_demand_samples = results
                .iter()
                .map(|result| result.summary.lost_demand[sku_idx])
                .collect::<Vec<_>>();
            let adjustment_samples = results
                .iter()
                .map(|result| result.summary.adjustments[sku_idx])
                .collect::<Vec<_>>();
            let receipt_samples = results
                .iter()
                .map(|result| result.summary.receipts[sku_idx])
                .collect::<Vec<_>>();
            let pre_clamp_samples = results
                .iter()
                .map(|result| result.summary.pre_clamp_inventory[sku_idx])
                .collect::<Vec<_>>();
            let inventory_position_samples = results
                .iter()
                .map(|result| result.summary.inventory_position[sku_idx])
                .collect::<Vec<_>>();
            let lead_time_std_samples = lead_time_variance_samples
                .iter()
                .map(|value| value.sqrt())
                .collect::<Vec<_>>();

            state.sku_inventory_traces[sku_idx].push(SenaTrajectoryPoint {
                at: interval.end_at.clone(),
                mean: weighted_mean(&inventory_samples, &weights),
                low: weighted_quantile(&inventory_samples, &weights, 0.1),
                high: weighted_quantile(&inventory_samples, &weights, 0.9),
            });
            state.sku_interval_traces[sku_idx].push(SenaIntervalPosterior {
                interval_index: interval.index,
                start_at: interval.start_at.clone(),
                end_at: interval.end_at.clone(),
                delta_days: interval.delta_days,
                service_demand_mean: weighted_mean(&service_demand_samples, &weights),
                retail_demand_mean: weighted_mean(&retail_demand_samples, &weights),
                unconstrained_demand_mean: weighted_mean(&demand_samples, &weights),
                realized_consumption_mean: weighted_mean(&realized_consumption_samples, &weights),
                lost_demand_mean: weighted_mean(&lost_demand_samples, &weights),
                adjustments_mean: weighted_mean(&adjustment_samples, &weights),
                receipts_mean: weighted_mean(&receipt_samples, &weights),
                pre_clamp_inventory_mean: weighted_mean(&pre_clamp_samples, &weights),
                inventory_position_mean: weighted_mean(&inventory_position_samples, &weights),
            });
            state.sku_pipeline_traces[sku_idx].push(SenaPipelinePosteriorPoint {
                interval_index: interval.index,
                in_transit_mean: weighted_mean(&pipeline_samples, &weights),
                order_probability: weighted_mean(
                    &results
                        .iter()
                        .map(|result| result.summary.order_probability[sku_idx])
                        .collect::<Vec<_>>(),
                    &weights,
                ),
                order_quantity_mean: weighted_mean(
                    &results
                        .iter()
                        .map(|result| result.summary.order_quantity[sku_idx])
                        .collect::<Vec<_>>(),
                    &weights,
                ),
                receipt_quantity_mean: weighted_mean(&receipt_samples, &weights),
                age_days_mean: weighted_mean(
                    &results
                        .iter()
                        .map(|result| result.summary.age_days[sku_idx])
                        .collect::<Vec<_>>(),
                    &weights,
                ),
            });

            let log_mean_samples = lead_time_mean_samples
                .iter()
                .map(|value| value.ln())
                .collect::<Vec<_>>();
            let log_std_samples = lead_time_std_samples
                .iter()
                .map(|value| value.max(1e-6).ln())
                .collect::<Vec<_>>();
            let log_variance_samples = lead_time_variance_samples
                .iter()
                .map(|value| value.max(1e-6).ln())
                .collect::<Vec<_>>();
            let shape_sigma_samples = lead_time_mean_samples
                .iter()
                .zip(lead_time_variance_samples.iter())
                .map(|(mean_days, variance_days_squared)| {
                    ((1.0 + variance_days_squared / mean_days.max(0.5).powi(2)).ln()).sqrt()
                })
                .collect::<Vec<_>>();

            state.sku_lead_time_traces[sku_idx].push(SenaLeadTimePosteriorPoint {
                interval_index: interval.index,
                log_mean_days: weighted_mean(&log_mean_samples, &weights),
                log_std_days: weighted_mean(&log_std_samples, &weights),
                log_variance_days_squared: weighted_mean(&log_variance_samples, &weights),
                mean_days: weighted_mean(&lead_time_mean_samples, &weights),
                std_days: weighted_mean(&lead_time_std_samples, &weights),
                variance_days_squared: weighted_mean(&lead_time_variance_samples, &weights),
                shape_sigma: weighted_mean(&shape_sigma_samples, &weights),
                observed_variability_class: interval
                    .lead_time_hint_by_sku
                    .get(catalog.skus[sku_idx].sku_id.as_str())
                    .and_then(|hint| {
                        derive_variability_class(
                            hint.variability_class,
                            hint.low_days,
                            hint.high_days,
                        )
                    }),
                observed_relative_width: interval
                    .lead_time_hint_by_sku
                    .get(catalog.skus[sku_idx].sku_id.as_str())
                    .and_then(|hint| derive_relative_width(hint.low_days, hint.high_days)),
            });
        }

        for service_idx in 0..catalog.services.len() {
            let service_samples = results
                .iter()
                .map(|result| result.summary.service_counts[service_idx])
                .collect::<Vec<_>>();
            state.service_activity_series[service_idx]
                .push(weighted_mean(&service_samples, &weights));
        }

        for (result, weight) in results.iter().zip(weights.iter()) {
            state.posterior_predictive_error_sum += result.summary.posterior_abs_error * *weight;
            state.coverage_hits += result.summary.coverage_hits as f64 * *weight;
            state.coverage_total += catalog.skus.len() as f64 * *weight;
            state.seasonality_magnitude_sum += result.summary.seasonal_magnitude * *weight;
        }

        state.latest_snapshot = Some(PosteriorSnapshot {
            weights: weights.clone(),
            inventory: (0..catalog.skus.len())
                .map(|sku_idx| {
                    results
                        .iter()
                        .map(|result| result.summary.inventory[sku_idx])
                        .collect::<Vec<_>>()
                })
                .collect(),
            pipeline: (0..catalog.skus.len())
                .map(|sku_idx| {
                    results
                        .iter()
                        .map(|result| result.summary.pipeline[sku_idx])
                        .collect::<Vec<_>>()
                })
                .collect(),
            demand_rate: (0..catalog.skus.len())
                .map(|sku_idx| {
                    results
                        .iter()
                        .map(|result| {
                            result.summary.total_demand[sku_idx] / interval.delta_days.max(1e-6)
                        })
                        .collect::<Vec<_>>()
                })
                .collect(),
            lead_time_mean: (0..catalog.skus.len())
                .map(|sku_idx| {
                    results
                        .iter()
                        .map(|result| result.summary.lead_time_mean[sku_idx])
                        .collect::<Vec<_>>()
                })
                .collect(),
            lead_time_variance: (0..catalog.skus.len())
                .map(|sku_idx| {
                    results
                        .iter()
                        .map(|result| result.summary.lead_time_variance[sku_idx])
                        .collect::<Vec<_>>()
                })
                .collect(),
            stockout_hit: (0..catalog.skus.len())
                .map(|sku_idx| {
                    results
                        .iter()
                        .map(|result| {
                            if result.summary.stockout_hit[sku_idx] {
                                1.0
                            } else {
                                0.0
                            }
                        })
                        .collect::<Vec<_>>()
                })
                .collect(),
        });

        state.regime_history.push(SenaRegimePosteriorPoint {
            interval_index: interval.index,
            start_at: interval.start_at.clone(),
            end_at: interval.end_at.clone(),
            dominant_regime,
            regime_probabilities: regime_votes,
        });

        state.particles = if should_resample {
            state.resampling_count += 1;
            let mut rng = StdRng::seed_from_u64(stable_seed(&(
                owner_sub,
                interval.index,
                particle_count as u64,
                "resample",
            )));
            resample_particles(&results, &weights, &mut rng)
        } else {
            results.into_iter().map(|result| result.particle).collect()
        };

        if checkpoint_interval.is_some_and(|value| value > 0 && interval.index % value == 0) {
            checkpoints.push(SenaAnalysisCheckpoint {
                metadata: build_checkpoint_metadata(
                    owner_sub,
                    algorithm_version,
                    &catalog_fingerprint,
                    observations,
                    interval.index,
                )?,
                state: state.clone(),
            });
        }
    }

    let mut result = finalize_analysis(
        owner_sub,
        catalog,
        observations,
        algorithm_version,
        preprocessed,
        state,
        &parameters,
    )?;
    let artifacts = AnalysisArtifacts {
        primary_artifact_key: format!(
            "sena-analysis/{owner_sub}/{algorithm_version}/posterior-draws"
        ),
        payload: serde_json::json!({
            "generatedAt": OffsetDateTime::now_utc().format(&Rfc3339).unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string()),
            "algorithmVersion": algorithm_version,
            "engineParameters": parameters,
            "skuDetails": result.sku_details.clone(),
            "serviceDetails": result.service_details.clone(),
            "diagnostics": result.diagnostics.clone()
        }),
    };
    result.workspace_summary.run_id = String::new();
    Ok(RunAnalysisOutput {
        result,
        artifacts,
        checkpoints,
    })
}

fn finalize_analysis(
    owner_sub: &str,
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    _algorithm_version: &str,
    preprocessed: &PreprocessedWorkspace,
    mut state: SenaAnalysisRuntimeState,
    parameters: &SenaEngineParameters,
) -> Result<SenaAnalysisResult> {
    if parameters.smoothing_enabled {
        smooth_inventory_traces(&mut state.sku_inventory_traces);
    }
    let latest_observed_at = observations
        .last()
        .map(|value| value.input.observed_at.clone());
    let latest_snapshot = state
        .latest_snapshot
        .clone()
        .ok_or_else(|| anyhow!("missing posterior snapshot"))?;
    let sku_count = catalog.skus.len();
    let service_count = catalog.services.len();

    let mut sku_summaries = Vec::new();
    let mut sku_details = Vec::new();
    for (sku_idx, sku) in catalog.skus.iter().enumerate() {
        let inventory_trace = &state.sku_inventory_traces[sku_idx];
        let demand_trace = &state.sku_interval_traces[sku_idx];
        let pipeline_trace = &state.sku_pipeline_traces[sku_idx];
        let lead_time_trace = &state.sku_lead_time_traces[sku_idx];
        let latest_inventory = inventory_trace
            .last()
            .map(|point| point.mean)
            .unwrap_or(0.0);
        let demand_per_day_mean = mean(
            &demand_trace
                .iter()
                .map(|interval| interval.unconstrained_demand_mean / interval.delta_days.max(1e-6))
                .collect::<Vec<_>>(),
        );
        let latest_demand_rate_draws = &latest_snapshot.demand_rate[sku_idx];
        let latest_lead_time_mean_draws = &latest_snapshot.lead_time_mean[sku_idx];
        let latest_lead_time_variance_draws = &latest_snapshot.lead_time_variance[sku_idx];
        let latest_inventory_draws = &latest_snapshot.inventory[sku_idx];
        let latest_pipeline_draws = &latest_snapshot.pipeline[sku_idx];
        let latest_stockout_draws = &latest_snapshot.stockout_hit[sku_idx];
        let lead_time_draws = latest_lead_time_mean_draws
            .iter()
            .zip(latest_lead_time_variance_draws.iter())
            .map(|(mean_days, variance_days_squared)| {
                let sigma =
                    ((1.0 + variance_days_squared / mean_days.max(0.5).powi(2)).ln()).sqrt();
                sample_lognormal_mean_std(
                    &mut StdRng::seed_from_u64(stable_seed(&(
                        owner_sub,
                        "summary",
                        sku_idx,
                        mean_days.to_bits(),
                    ))),
                    *mean_days,
                    sigma,
                )
            })
            .collect::<Vec<_>>();
        let lead_time_demand_draws = latest_demand_rate_draws
            .iter()
            .zip(lead_time_draws.iter())
            .map(|(demand_rate, lead_time)| demand_rate * lead_time)
            .collect::<Vec<_>>();
        let expected_lead_time_demand =
            weighted_mean(&lead_time_demand_draws, &latest_snapshot.weights);
        let lead_time_demand_variance = weighted_variance(
            &lead_time_demand_draws,
            &latest_snapshot.weights,
            expected_lead_time_demand,
        );
        let safety_stock = normal_quantile(parameters.target_service_level)
            * lead_time_demand_variance.max(0.0).sqrt();
        let reorder_point = expected_lead_time_demand + safety_stock;
        let reorder_trigger_probability = latest_inventory_draws
            .iter()
            .zip(latest_pipeline_draws.iter())
            .zip(latest_snapshot.weights.iter())
            .map(|((inventory, pipeline), weight)| {
                if inventory + pipeline <= reorder_point {
                    *weight
                } else {
                    0.0
                }
            })
            .sum::<f64>()
            .clamp(0.0, 1.0);
        let reorder_quantity = compute_reorder_quantity_recommendation(
            latest_inventory_draws,
            latest_pipeline_draws,
            latest_demand_rate_draws,
            &lead_time_draws,
            &latest_snapshot.weights,
            parameters,
        );
        let stockout_risk =
            weighted_mean(latest_stockout_draws, &latest_snapshot.weights).clamp(0.0, 1.0);
        let days_of_cover = if demand_per_day_mean > 0.0 {
            Some(latest_inventory / demand_per_day_mean.max(1e-6))
        } else {
            None
        };
        let lead_time_mean_days =
            weighted_mean(latest_lead_time_mean_draws, &latest_snapshot.weights).max(0.5);
        let lead_time_variance_days_squared =
            weighted_mean(latest_lead_time_variance_draws, &latest_snapshot.weights).max(1e-6);
        let lead_time_std_days = lead_time_variance_days_squared.sqrt();
        let summary = SenaSkuSummary {
            sku_id: sku.sku_id.clone(),
            latest_posterior_units: latest_inventory,
            credible_interval_low: inventory_trace.last().map(|point| point.low).unwrap_or(0.0),
            credible_interval_high: inventory_trace
                .last()
                .map(|point| point.high)
                .unwrap_or(0.0),
            demand_per_day_mean,
            stockout_risk,
            days_of_cover,
            expected_lead_time_demand,
            safety_stock,
            reorder_point,
            reorder_trigger_probability,
            reorder_quantity,
            lead_time_mean_days,
            lead_time_std_days,
            regime_probabilities: state.latest_regime_probabilities.clone(),
        };
        sku_details.push(SenaSkuDetail {
            summary: summary.clone(),
            inventory_posterior: inventory_trace.clone(),
            demand_posterior: demand_trace.clone(),
            pipeline_posterior: pipeline_trace.clone(),
            lead_time_posterior: lead_time_trace.clone(),
        });
        sku_summaries.push(summary);
    }

    sku_summaries.sort_by(|left, right| {
        right
            .stockout_risk
            .partial_cmp(&left.stockout_risk)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    let pending_reorder_count = sku_summaries
        .iter()
        .filter(|summary| summary.reorder_quantity.recommendation_issued)
        .count();
    let high_risk_sku_ids = sku_summaries
        .iter()
        .filter(|summary| summary.stockout_risk >= 0.35)
        .take(5)
        .map(|summary| summary.sku_id.clone())
        .collect::<Vec<_>>();
    let top_regime = state
        .regime_history
        .last()
        .map(|entry| entry.dominant_regime.clone())
        .unwrap_or_else(|| "normal".to_string());
    let mut service_details = Vec::new();
    for (service_idx, service) in catalog.services.iter().enumerate() {
        let contributors = preprocessed.usage_map[service_idx]
            .iter()
            .map(|(sku_idx, probability)| SenaServiceContributor {
                sku_id: catalog.skus[*sku_idx].sku_id.clone(),
                usage_probability: *probability,
                bottleneck_probability: sku_summaries
                    .iter()
                    .find(|summary| summary.sku_id == catalog.skus[*sku_idx].sku_id)
                    .map(|summary| summary.stockout_risk)
                    .unwrap_or(0.0),
                reorder_quantity: sku_summaries
                    .iter()
                    .find(|summary| summary.sku_id == catalog.skus[*sku_idx].sku_id)
                    .map(|summary| summary.reorder_quantity.clone()),
            })
            .collect::<Vec<_>>();
        let activity = &state.service_activity_series[service_idx];
        service_details.push(SenaServiceDetail {
            service_id: service.service_id.clone(),
            activity_mean: mean(activity),
            activity_interval_low: quantile(activity, 0.1),
            activity_interval_high: quantile(activity, 0.9),
            bottleneck_probability: mean(
                &contributors
                    .iter()
                    .map(|contributor| contributor.bottleneck_probability)
                    .collect::<Vec<_>>(),
            ),
            contributors,
            regime_timeline: state.regime_history.clone(),
        });
    }

    let diagnostics = SenaDiagnostics {
        effective_sample_size_mean: mean(&state.ess_values),
        resampling_count: state.resampling_count,
        smoothing_enabled: parameters.smoothing_enabled,
        change_point_probability: state.latest_change_point_probability,
        latest_change_point_probability: state.latest_change_point_probability,
        seasonality_active: !state.particles.is_empty()
            && mean_particle_seasonality_magnitude(&state.particles)
                + state.seasonality_magnitude_sum
                > 0.04,
        posterior_predictive_error_mean: state.posterior_predictive_error_sum
            / preprocessed.intervals.len().max(1) as f64,
        coverage_estimate: if state.coverage_total > 0.0 {
            (state.coverage_hits / state.coverage_total).clamp(0.0, 1.0)
        } else {
            0.0
        },
        regime_history: state.regime_history.clone(),
    };
    Ok(SenaAnalysisResult {
        workspace_summary: SenaWorkspaceSummary {
            owner_sub: owner_sub.to_string(),
            run_id: String::new(),
            latest_observed_at,
            sku_count,
            service_count,
            interval_count: preprocessed.intervals.len(),
            pending_reorder_count,
            top_regime,
            high_risk_sku_ids,
            sku_summaries,
        },
        sku_details,
        service_details,
        diagnostics,
    })
}

fn execute_particle_batches(
    owner_sub: &str,
    interval: &PreprocessedInterval,
    particles: &[Particle],
    catalog: &SenaCatalog,
    preprocessed: &PreprocessedWorkspace,
    sku_index: &HashMap<&str, usize>,
    service_index: &HashMap<&str, usize>,
) -> Vec<IntervalParticleResult> {
    let particle_count = particles.len();
    let context = ParticleStepContext {
        owner_sub,
        catalog,
        interval,
        usage_map: &preprocessed.usage_map,
        sku_capacity_hints: &preprocessed.sku_capacity_hints,
        observation_sigma: &preprocessed.observation_sigma,
        sku_index,
        service_index,
    };
    #[cfg(not(feature = "desktop"))]
    {
        return particles
            .iter()
            .enumerate()
            .map(|(particle_index, particle)| {
                step_particle(particle_index, particle_count, particle, &context)
            })
            .collect();
    }

    #[cfg(feature = "desktop")]
    {
        let ranges = particle_batch_ranges(particles.len());
        let pool = particle_thread_pool();
        pool.install(|| {
            ranges
                .into_par_iter()
                .map(|(start, end)| {
                    let mut batch_results = Vec::with_capacity(end - start);
                    for (particle_index, particle) in particles[start..end].iter().enumerate() {
                        let absolute_index = start + particle_index;
                        batch_results.push(step_particle(
                            absolute_index,
                            particle_count,
                            particle,
                            &context,
                        ));
                    }
                    batch_results
                })
                .reduce(Vec::new, |mut left, mut right| {
                    left.append(&mut right);
                    left
                })
        })
    }
}

pub fn run_analysis(
    owner_sub: &str,
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    algorithm_version: &str,
) -> Result<(SenaAnalysisResult, AnalysisArtifacts)> {
    run_analysis_with_parameters(owner_sub, catalog, observations, algorithm_version, None)
}

pub fn run_analysis_with_parameters(
    owner_sub: &str,
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    algorithm_version: &str,
    parameters: Option<&SenaEngineParameters>,
) -> Result<(SenaAnalysisResult, AnalysisArtifacts)> {
    catalog.validate()?;
    for observation in observations {
        observation.input.validate()?;
    }
    let preprocessed = preprocess_workspace(catalog, observations)?;
    let output = run_preprocessed_analysis_with_parameters(
        owner_sub,
        catalog,
        observations,
        algorithm_version,
        &preprocessed,
        None,
        None,
        parameters,
    )?;
    Ok((output.result, output.artifacts))
}

struct ParticleStepContext<'a> {
    owner_sub: &'a str,
    catalog: &'a SenaCatalog,
    interval: &'a PreprocessedInterval,
    usage_map: &'a [Vec<(usize, f64)>],
    sku_capacity_hints: &'a [f64],
    observation_sigma: &'a [f64],
    sku_index: &'a HashMap<&'a str, usize>,
    service_index: &'a HashMap<&'a str, usize>,
}

fn step_particle(
    particle_index: usize,
    particle_count: usize,
    particle: &Particle,
    context: &ParticleStepContext<'_>,
) -> IntervalParticleResult {
    let mut rng = StdRng::seed_from_u64(particle_seed(
        context.owner_sub,
        context.interval.index,
        particle_count,
        particle_index,
    ));
    let mut next = particle.clone();
    let catalog = context.catalog;
    let interval = context.interval;
    let usage_map = context.usage_map;
    let sku_capacity_hints = context.sku_capacity_hints;
    let observation_sigma = context.observation_sigma;
    let sku_index = context.sku_index;
    let service_index = context.service_index;
    let sku_count = catalog.skus.len();
    let service_count = catalog.services.len();

    let ranking_pressure = (interval.service_rank_order.len() + interval.retail_rank_order.len())
        as f64
        + interval.exact_service_sales_by_service.len() as f64
        + interval.exact_retail_sales_by_sku.len() as f64;
    let stockout_pressure =
        (interval.service_stockouts.len() + interval.retail_stockouts.len()) as f64;
    let price_pressure = mean(
        &interval
            .centered_service_prices
            .values()
            .chain(interval.centered_retail_prices.values())
            .map(|value| value.abs())
            .collect::<Vec<_>>(),
    );
    let correction_pressure = mean(
        &interval
            .observed_delta_by_sku
            .values()
            .map(|value| value.abs())
            .collect::<Vec<_>>(),
    ) / 6.0;
    let change_point_probability =
        (0.02 + ranking_pressure * 0.02 + stockout_pressure * 0.05 + price_pressure * 0.12)
            .clamp(0.01, 0.55);
    let change_point = rng.gen::<f64>() < change_point_probability;
    let regime = sample_regime(
        &mut rng,
        interval,
        ranking_pressure,
        stockout_pressure,
        price_pressure,
        correction_pressure,
        change_point,
    );
    let regime_config = regime_config(regime);

    let mut service_counts = vec![0.0; service_count];
    let mut service_demand = vec![0.0; sku_count];
    let mut retail_demand = vec![0.0; sku_count];
    let mut total_demand = vec![0.0; sku_count];
    let mut realized_consumption = vec![0.0; sku_count];
    let mut lost_demand = vec![0.0; sku_count];
    let mut adjustments = vec![0.0; sku_count];
    let mut receipts = vec![0.0; sku_count];
    let mut order_probability = vec![0.0; sku_count];
    let mut order_quantity = vec![0.0; sku_count];
    let mut pre_clamp_inventory = vec![0.0; sku_count];
    let mut pipeline = vec![0.0; sku_count];
    let mut inventory_position = vec![0.0; sku_count];
    let mut stockout_hit = vec![false; sku_count];
    let mut lead_time_mean = vec![0.0; sku_count];
    let mut lead_time_variance = vec![0.0; sku_count];
    let mut posterior_abs_error = 0.0;
    let mut coverage_hits = 0_usize;
    let mut seasonal_magnitude = 0.0;
    let seasonal_scale = interval.delta_days.sqrt();

    for (service_idx, service) in catalog.services.iter().enumerate() {
        let centered_price = *interval
            .centered_service_prices
            .get(service.service_id.as_str())
            .unwrap_or(&0.0);
        let seasonal = next.seasonality_dow[service_idx][interval.day_of_week]
            + next.seasonality_month[service_idx][interval.month_index];
        seasonal_magnitude += seasonal.abs();
        let drift = heavy_tailed_shock(&mut rng, 0.08 * seasonal_scale);
        let next_log_rate = if change_point {
            0.55 * next.log_service_rate[service_idx]
                + 0.45 * (-0.20 * centered_price + seasonal)
                + heavy_tailed_shock(&mut rng, 0.18)
        } else {
            next.log_service_rate[service_idx] + drift - 0.20 * centered_price + seasonal
        } + regime_config.service_log_shift;
        next.log_service_rate[service_idx] = next_log_rate.clamp(-6.0, 3.4);

        for recipe_state in &mut next.recipe_log_means[service_idx] {
            let recipe_drift =
                sample_normal(&mut rng) * 0.04 * seasonal_scale + regime_config.recipe_log_shift;
            *recipe_state = if change_point {
                0.6 * *recipe_state + 0.4 * regime_config.recipe_log_shift
            } else {
                *recipe_state + recipe_drift
            }
            .clamp(-1.5, 1.8);
        }

        let mean_count = next.log_service_rate[service_idx].exp()
            * interval.delta_days.max(1e-3)
            * regime_config.service_multiplier;
        let variance_count = mean_count + mean_count.powi(2) / regime_config.service_dispersion;
        let count = interval
            .exact_service_sales_by_service
            .get(service.service_id.as_str())
            .copied()
            .unwrap_or_else(|| sample_count(mean_count, variance_count, &mut rng) as f64);
        service_counts[service_idx] = count;

        for (link_idx, (sku_idx, usage_probability)) in usage_map[service_idx].iter().enumerate() {
            let active_instances = sample_count(
                count * usage_probability,
                (count * usage_probability.max(0.05)).max(0.1),
                &mut rng,
            ) as f64;
            let base_usage_mean = next.recipe_log_means[service_idx][link_idx].exp().max(0.15);
            let unit_usage = sample_positive(&mut rng, base_usage_mean, 0.22);
            service_demand[*sku_idx] += active_instances * unit_usage;
        }
    }

    let mut interval_receipt_events = vec![Vec::<(f64, f64)>::new(); sku_count];
    for (sku_idx, sku) in catalog.skus.iter().enumerate() {
        let centered_price = *interval
            .centered_retail_prices
            .get(sku.sku_id.as_str())
            .unwrap_or(&0.0);
        let retail_drift = heavy_tailed_shock(&mut rng, 0.07 * seasonal_scale);
        next.log_retail_rate[sku_idx] = if change_point {
            0.55 * next.log_retail_rate[sku_idx]
                + 0.45 * (-0.18 * centered_price)
                + heavy_tailed_shock(&mut rng, 0.15)
        } else {
            next.log_retail_rate[sku_idx] + retail_drift - 0.18 * centered_price
        } + regime_config.retail_log_shift;
        next.log_retail_rate[sku_idx] = next.log_retail_rate[sku_idx].clamp(-7.0, 2.8);

        let current_lead_time_mean = next.log_lead_time_mean[sku_idx].exp().max(0.5);
        let current_lead_time_variance = next.log_lead_time_variance[sku_idx].exp().max(0.05);
        if let Some(hint) = interval.lead_time_hint_by_sku.get(sku.sku_id.as_str()) {
            if let Some(typical_days) = hint.typical_days {
                let target = typical_days.max(0.5).ln();
                next.log_lead_time_mean[sku_idx] +=
                    0.25 * (target - next.log_lead_time_mean[sku_idx]);
            }
            if let Some(class) =
                derive_variability_class(hint.variability_class, hint.low_days, hint.high_days)
            {
                let target_variance = target_std_days(current_lead_time_mean, class)
                    .powi(2)
                    .max(0.05);
                next.log_lead_time_variance[sku_idx] +=
                    0.30 * (target_variance.ln() - next.log_lead_time_variance[sku_idx]);
            }
        }
        next.log_lead_time_mean[sku_idx] = if change_point {
            0.7 * next.log_lead_time_mean[sku_idx] + 0.3 * current_lead_time_mean.max(1.0).ln()
        } else {
            next.log_lead_time_mean[sku_idx] + heavy_tailed_shock(&mut rng, 0.05 * seasonal_scale)
        }
        .clamp(0.0, 3.1);
        next.log_lead_time_variance[sku_idx] = if change_point {
            0.65 * next.log_lead_time_variance[sku_idx] + 0.35 * current_lead_time_variance.ln()
        } else {
            next.log_lead_time_variance[sku_idx]
                + heavy_tailed_shock(&mut rng, 0.07 * seasonal_scale)
        }
        .clamp(-2.5, 4.0);
        lead_time_mean[sku_idx] = next.log_lead_time_mean[sku_idx].exp().max(0.5);
        lead_time_variance[sku_idx] = next.log_lead_time_variance[sku_idx].exp().max(0.05);

        let retail_count_mean = if sku.sold_as_product {
            next.log_retail_rate[sku_idx].exp()
                * interval.delta_days.max(1e-3)
                * regime_config.retail_multiplier
        } else {
            0.0
        };
        let retail_count_variance =
            retail_count_mean + retail_count_mean.powi(2) / regime_config.retail_dispersion;
        retail_demand[sku_idx] = interval
            .exact_retail_sales_by_sku
            .get(sku.sku_id.as_str())
            .copied()
            .unwrap_or_else(|| {
                sample_count(retail_count_mean, retail_count_variance, &mut rng) as f64
            });

        total_demand[sku_idx] = service_demand[sku_idx] + retail_demand[sku_idx];

        next.order_alpha[sku_idx] += sample_normal(&mut rng) * 0.03 * seasonal_scale;
        next.order_beta[sku_idx] += sample_normal(&mut rng) * 0.02 * seasonal_scale;
        next.order_beta[sku_idx] = next.order_beta[sku_idx].clamp(-3.0, 0.5);

        let pipeline_before = next.order_books[sku_idx]
            .iter()
            .map(|batch| batch.quantity)
            .sum::<f64>();
        let scaled_inventory = particle.inventory[sku_idx] / sku_capacity_hints[sku_idx].max(1.0);
        let scaled_pipeline = pipeline_before / sku_capacity_hints[sku_idx].max(1.0);
        let latent_demand_rate = total_demand[sku_idx] / interval.delta_days.max(1e-6);
        let target_inventory_position = (latent_demand_rate * lead_time_mean[sku_idx] * 1.4)
            .max(sku_capacity_hints[sku_idx] * 0.45)
            .max(2.0);
        let order_logit = next.order_alpha[sku_idx]
            + next.order_beta[sku_idx] * scaled_inventory
            + next.order_gamma[sku_idx] * particle.age_days[sku_idx]
            + next.order_xi[sku_idx] * scaled_pipeline
            + if interval
                .order_signal_by_sku
                .get(sku.sku_id.as_str())
                .map(|signal| signal.order_placed)
                .unwrap_or(false)
            {
                1.0
            } else {
                0.0
            };
        order_probability[sku_idx] = logistic(order_logit).clamp(0.01, 0.98);
        let order_happened = rng.gen::<f64>() < order_probability[sku_idx];
        let placement_day = interval.start_day + 0.5 * interval.delta_days;
        if order_happened {
            let gap = (target_inventory_position - particle.inventory[sku_idx] - pipeline_before)
                .max(0.0)
                .max(1.0);
            let mu_order = gap.ln();
            let order_size = sample_lognormal_from_location(&mut rng, mu_order, 0.30)
                .min(sku_capacity_hints[sku_idx] * 2.8);
            order_quantity[sku_idx] = interval
                .order_signal_by_sku
                .get(sku.sku_id.as_str())
                .and_then(|signal| signal.approximate_order_quantity)
                .map(|approx| sample_positive(&mut rng, approx.max(0.5), 0.08))
                .unwrap_or(order_size)
                .max(0.0);
            let arrival_day = placement_day
                + sample_lognormal_mean_variance(
                    &mut rng,
                    lead_time_mean[sku_idx],
                    lead_time_variance[sku_idx],
                );
            next.order_books[sku_idx].push(OrderBatch {
                quantity: order_quantity[sku_idx],
                arrival_day,
            });
            next.age_days[sku_idx] = 0.0;
        } else {
            next.age_days[sku_idx] += interval.delta_days;
        }

        let mut remaining_orders = Vec::new();
        for batch in next.order_books[sku_idx].drain(..) {
            if batch.arrival_day > interval.start_day && batch.arrival_day <= interval.end_day {
                receipts[sku_idx] += batch.quantity;
                interval_receipt_events[sku_idx].push((batch.arrival_day, batch.quantity));
            } else {
                remaining_orders.push(batch);
            }
        }
        next.order_books[sku_idx] = remaining_orders;
        pipeline[sku_idx] = next.order_books[sku_idx]
            .iter()
            .map(|batch| batch.quantity)
            .sum::<f64>();

        let available = particle.inventory[sku_idx] + receipts[sku_idx];
        realized_consumption[sku_idx] = total_demand[sku_idx].min(available.max(0.0));
        lost_demand[sku_idx] = (total_demand[sku_idx] - realized_consumption[sku_idx]).max(0.0);

        let observed = *interval
            .stock_by_sku
            .get(sku.sku_id.as_str())
            .unwrap_or(&particle.inventory[sku_idx]);
        let implied_pre_clamp =
            particle.inventory[sku_idx] + receipts[sku_idx] - realized_consumption[sku_idx];
        let implied_adjustment = observed - implied_pre_clamp;
        let adjustment_mean = regime_config.adjustment_mean
            + if regime == "correction" {
                implied_adjustment * 0.65
            } else {
                0.0
            };
        adjustments[sku_idx] =
            sample_normal(&mut rng) * regime_config.adjustment_std + adjustment_mean;

        pre_clamp_inventory[sku_idx] = particle.inventory[sku_idx] + receipts[sku_idx]
            - realized_consumption[sku_idx]
            + adjustments[sku_idx];
        next.inventory[sku_idx] = pre_clamp_inventory[sku_idx].max(0.0);
        inventory_position[sku_idx] = next.inventory[sku_idx] + pipeline[sku_idx];

        stockout_hit[sku_idx] = compute_stockout_hit(
            particle.inventory[sku_idx],
            &interval_receipt_events[sku_idx],
            total_demand[sku_idx],
            adjustments[sku_idx],
            interval.start_day,
            interval.end_day,
        );

        let residual = observed - next.inventory[sku_idx];
        let sigma = observation_sigma[sku_idx].max(0.5);
        posterior_abs_error += residual.abs();
        if residual.abs() <= 2.0 * sigma {
            coverage_hits += 1;
        }
    }

    let mut log_weight = 0.0;
    for (sku_idx, sku) in catalog.skus.iter().enumerate() {
        let observed = *interval
            .stock_by_sku
            .get(sku.sku_id.as_str())
            .unwrap_or(&next.inventory[sku_idx]);
        let sigma = observation_sigma[sku_idx].max(0.5);
        log_weight += gaussian_logpdf(observed, next.inventory[sku_idx], sigma);

        if let Some(signal) = interval.order_signal_by_sku.get(sku.sku_id.as_str()) {
            log_weight += event_loglik(signal.order_placed, order_quantity[sku_idx] > 0.0, 0.88);
            log_weight += event_loglik(signal.receipt_arrived, receipts[sku_idx] > 0.0, 0.85);
            if let Some(approx) = signal.approximate_order_quantity {
                log_weight += gaussian_logpdf(
                    approx,
                    order_quantity[sku_idx],
                    (approx.abs() * 0.25).max(1.0),
                );
            }
            if let Some(approx) = signal.approximate_receipt_quantity {
                log_weight +=
                    gaussian_logpdf(approx, receipts[sku_idx], (approx.abs() * 0.25).max(1.0));
            }
        }

        if interval
            .retail_stockouts
            .iter()
            .any(|value| value == &sku.sku_id)
        {
            log_weight += if stockout_hit[sku_idx] { 0.0 } else { -1.2 };
        } else if stockout_hit[sku_idx] {
            log_weight -= 0.35;
        }

        if let Some(hint) = interval.lead_time_hint_by_sku.get(sku.sku_id.as_str()) {
            if let Some(typical_days) = hint.typical_days {
                log_weight += gaussian_logpdf(
                    typical_days.max(0.5).ln(),
                    lead_time_mean[sku_idx].ln(),
                    0.35,
                );
            }
            if let Some(class) =
                derive_variability_class(hint.variability_class, hint.low_days, hint.high_days)
            {
                let target_sigma = target_std_days(lead_time_mean[sku_idx], class);
                log_weight += gaussian_logpdf(
                    target_sigma.max(0.1).ln(),
                    lead_time_variance[sku_idx].sqrt().max(0.1).ln(),
                    0.45,
                );
            }
        }
    }

    for pair in interval.service_rank_order.windows(2) {
        if let (Some(&left_idx), Some(&right_idx)) = (
            service_index.get(pair[0].as_str()),
            service_index.get(pair[1].as_str()),
        ) {
            let diff = next.log_service_rate[left_idx] - next.log_service_rate[right_idx];
            log_weight += logistic((diff / 1.0).clamp(-8.0, 8.0)).max(1e-8).ln();
        }
    }
    for (service_id, exact_units_sold) in &interval.exact_service_sales_by_service {
        if let Some(&service_idx) = service_index.get(service_id.as_str()) {
            log_weight += gaussian_logpdf(
                *exact_units_sold,
                service_counts[service_idx],
                (exact_units_sold.abs() * 0.2).max(1.0),
            );
        }
    }
    for (sku_id, exact_units_sold) in &interval.exact_retail_sales_by_sku {
        if let Some(&sku_idx) = sku_index.get(sku_id.as_str()) {
            log_weight += gaussian_logpdf(
                *exact_units_sold,
                retail_demand[sku_idx],
                (exact_units_sold.abs() * 0.2).max(1.0),
            );
        }
    }
    for pair in interval.retail_rank_order.windows(2) {
        if let (Some(&left_idx), Some(&right_idx)) = (
            sku_index.get(pair[0].as_str()),
            sku_index.get(pair[1].as_str()),
        ) {
            let diff = next.log_retail_rate[left_idx] - next.log_retail_rate[right_idx];
            log_weight += logistic((diff / 1.0).clamp(-8.0, 8.0)).max(1e-8).ln();
        }
    }

    for service_id in &interval.service_stockouts {
        if let Some(&service_idx) = service_index.get(service_id.as_str()) {
            let linked_stockout = usage_map[service_idx]
                .iter()
                .any(|(sku_idx, _)| stockout_hit[*sku_idx]);
            if linked_stockout {
                log_weight += 0.0;
            } else {
                log_weight -= 1.0;
            }
        }
    }

    IntervalParticleResult {
        particle_index,
        particle: next.clone(),
        summary: IntervalSummary {
            inventory: next.inventory.clone(),
            pipeline,
            service_demand,
            retail_demand,
            total_demand,
            realized_consumption,
            lost_demand,
            adjustments,
            receipts,
            order_probability,
            order_quantity,
            age_days: next.age_days.clone(),
            pre_clamp_inventory,
            inventory_position,
            stockout_hit,
            lead_time_mean,
            lead_time_variance,
            service_counts,
            regime,
            change_point,
            posterior_abs_error,
            coverage_hits,
            seasonal_magnitude,
        },
        log_weight,
    }
}

fn normalize_intervals(
    observations: &[SenaObservationRecord],
) -> Result<Vec<PreprocessedInterval>> {
    if observations.len() < 2 {
        return Ok(Vec::new());
    }

    let mut service_price_sum = HashMap::<String, f64>::new();
    let mut service_price_count = HashMap::<String, usize>::new();
    let mut retail_price_sum = HashMap::<String, f64>::new();
    let mut retail_price_count = HashMap::<String, usize>::new();
    let mut intervals = Vec::new();

    for (index, pair) in observations.windows(2).enumerate() {
        let start_at = OffsetDateTime::parse(&pair[0].input.observed_at, &Rfc3339)
            .map_err(|err| anyhow!("invalid observation timestamp: {err}"))?;
        let end_at = OffsetDateTime::parse(&pair[1].input.observed_at, &Rfc3339)
            .map_err(|err| anyhow!("invalid observation timestamp: {err}"))?;
        let delta_days = ((end_at - start_at).whole_seconds().max(86_400) as f64) / 86_400.0;

        let mut centered_service_prices = HashMap::new();
        for entry in &pair[1].input.service_prices {
            let value = entry.price.max(0.01).ln();
            let previous_sum = service_price_sum
                .get(&entry.service_id)
                .copied()
                .unwrap_or(0.0);
            let previous_count = service_price_count
                .get(&entry.service_id)
                .copied()
                .unwrap_or(0);
            let centered = value - (previous_sum + value) / (previous_count + 1) as f64;
            centered_service_prices.insert(entry.service_id.clone(), centered);
            service_price_sum
                .entry(entry.service_id.clone())
                .and_modify(|current| *current += value)
                .or_insert(value);
            service_price_count
                .entry(entry.service_id.clone())
                .and_modify(|current| *current += 1)
                .or_insert(1);
        }

        let mut centered_retail_prices = HashMap::new();
        for entry in &pair[1].input.retail_prices {
            let value = entry.price.max(0.01).ln();
            let previous_sum = retail_price_sum.get(&entry.sku_id).copied().unwrap_or(0.0);
            let previous_count = retail_price_count.get(&entry.sku_id).copied().unwrap_or(0);
            let centered = value - (previous_sum + value) / (previous_count + 1) as f64;
            centered_retail_prices.insert(entry.sku_id.clone(), centered);
            retail_price_sum
                .entry(entry.sku_id.clone())
                .and_modify(|current| *current += value)
                .or_insert(value);
            retail_price_count
                .entry(entry.sku_id.clone())
                .and_modify(|current| *current += 1)
                .or_insert(1);
        }

        let previous_stock = pair[0]
            .input
            .stock_snapshot
            .iter()
            .map(|entry| (entry.sku_id.clone(), entry.units_in_stock))
            .collect::<HashMap<_, _>>();
        let current_stock = pair[1]
            .input
            .stock_snapshot
            .iter()
            .map(|entry| (entry.sku_id.clone(), entry.units_in_stock))
            .collect::<HashMap<_, _>>();
        let observed_delta_by_sku = current_stock
            .iter()
            .map(|(sku_id, current)| {
                let previous = previous_stock.get(sku_id).copied().unwrap_or(*current);
                (sku_id.clone(), current - previous)
            })
            .collect::<HashMap<_, _>>();
        let exact_service_sales_by_service = pair[1]
            .input
            .service_sales_snapshot
            .iter()
            .map(|entry| (entry.service_id.clone(), entry.units_sold.max(0.0)))
            .collect::<HashMap<_, _>>();
        let exact_retail_sales_by_sku = pair[1]
            .input
            .retail_sales_snapshot
            .iter()
            .map(|entry| (entry.sku_id.clone(), entry.units_sold.max(0.0)))
            .collect::<HashMap<_, _>>();
        let service_rank_order = if exact_service_sales_by_service.is_empty() {
            pair[1].input.service_rankings.to_vec()
        } else {
            let mut ranked = pair[1]
                .input
                .service_sales_snapshot
                .iter()
                .map(|entry| (entry.service_id.clone(), entry.units_sold))
                .collect::<Vec<_>>();
            ranked.sort_by(|left, right| {
                right
                    .1
                    .partial_cmp(&left.1)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| left.0.cmp(&right.0))
            });
            ranked
                .into_iter()
                .map(|(service_id, _)| service_id)
                .collect()
        };
        let retail_rank_order = if exact_retail_sales_by_sku.is_empty() {
            pair[1].input.retail_rankings.to_vec()
        } else {
            let mut ranked = pair[1]
                .input
                .retail_sales_snapshot
                .iter()
                .map(|entry| (entry.sku_id.clone(), entry.units_sold))
                .collect::<Vec<_>>();
            ranked.sort_by(|left, right| {
                right
                    .1
                    .partial_cmp(&left.1)
                    .unwrap_or(std::cmp::Ordering::Equal)
                    .then_with(|| left.0.cmp(&right.0))
            });
            ranked.into_iter().map(|(sku_id, _)| sku_id).collect()
        };

        intervals.push(PreprocessedInterval {
            index: index + 1,
            start_at: pair[0].input.observed_at.clone(),
            end_at: pair[1].input.observed_at.clone(),
            start_day: start_at.unix_timestamp() as f64 / 86_400.0,
            end_day: end_at.unix_timestamp() as f64 / 86_400.0,
            delta_days,
            day_of_week: start_at.weekday().number_days_from_monday() as usize,
            month_index: month_to_index(start_at.month()),
            stock_by_sku: current_stock,
            observed_delta_by_sku,
            exact_service_sales_by_service,
            exact_retail_sales_by_sku,
            service_rank_order,
            retail_rank_order,
            service_stockouts: pair[1].input.service_stockouts.to_vec(),
            retail_stockouts: pair[1].input.retail_stockouts.to_vec(),
            order_signal_by_sku: pair[1]
                .input
                .order_signals
                .iter()
                .map(|entry| (entry.sku_id.clone(), entry.clone()))
                .collect(),
            lead_time_hint_by_sku: pair[1]
                .input
                .lead_time_hints
                .iter()
                .map(|entry| (entry.sku_id.clone(), entry.clone()))
                .collect(),
            centered_service_prices,
            centered_retail_prices,
        });
    }

    Ok(intervals)
}

fn estimate_observation_sigma(
    catalog: &SenaCatalog,
    observations: &[SenaObservationRecord],
    sku_index: &HashMap<&str, usize>,
) -> Vec<f64> {
    let mut values = vec![Vec::<f64>::new(); catalog.skus.len()];
    for observation in observations {
        for snapshot in &observation.input.stock_snapshot {
            if let Some(&sku_idx) = sku_index.get(snapshot.sku_id.as_str()) {
                values[sku_idx].push(snapshot.units_in_stock);
            }
        }
    }
    values
        .into_iter()
        .map(|series| {
            if series.len() < 2 {
                return 1.0;
            }
            let mean_value = mean(&series);
            let variance = series
                .iter()
                .map(|value| (value - mean_value).powi(2))
                .sum::<f64>()
                / (series.len() - 1) as f64;
            (variance.sqrt() * 0.25 + 0.75).max(0.75)
        })
        .collect()
}

fn regime_config(regime: &str) -> RegimeConfig {
    match regime {
        "spike" => RegimeConfig {
            service_multiplier: 1.45,
            retail_multiplier: 1.30,
            service_dispersion: 0.9,
            retail_dispersion: 1.0,
            service_log_shift: 0.20,
            retail_log_shift: 0.12,
            recipe_log_shift: 0.05,
            adjustment_mean: 0.0,
            adjustment_std: 0.55,
        },
        "lull" => RegimeConfig {
            service_multiplier: 0.65,
            retail_multiplier: 0.70,
            service_dispersion: 4.5,
            retail_dispersion: 4.0,
            service_log_shift: -0.18,
            retail_log_shift: -0.12,
            recipe_log_shift: -0.03,
            adjustment_mean: 0.0,
            adjustment_std: 0.35,
        },
        "stockout_constrained" => RegimeConfig {
            service_multiplier: 1.15,
            retail_multiplier: 1.05,
            service_dispersion: 1.2,
            retail_dispersion: 1.3,
            service_log_shift: 0.08,
            retail_log_shift: 0.04,
            recipe_log_shift: 0.02,
            adjustment_mean: 0.0,
            adjustment_std: 0.35,
        },
        "promo" => RegimeConfig {
            service_multiplier: 1.35,
            retail_multiplier: 1.18,
            service_dispersion: 1.1,
            retail_dispersion: 1.2,
            service_log_shift: 0.12,
            retail_log_shift: 0.08,
            recipe_log_shift: 0.12,
            adjustment_mean: 0.0,
            adjustment_std: 0.45,
        },
        "correction" => RegimeConfig {
            service_multiplier: 1.0,
            retail_multiplier: 1.0,
            service_dispersion: 2.2,
            retail_dispersion: 2.2,
            service_log_shift: 0.0,
            retail_log_shift: 0.0,
            recipe_log_shift: 0.0,
            adjustment_mean: 0.0,
            adjustment_std: 1.4,
        },
        _ => RegimeConfig {
            service_multiplier: 1.0,
            retail_multiplier: 1.0,
            service_dispersion: 2.2,
            retail_dispersion: 2.4,
            service_log_shift: 0.0,
            retail_log_shift: 0.0,
            recipe_log_shift: 0.0,
            adjustment_mean: 0.0,
            adjustment_std: 0.4,
        },
    }
}

struct RegimeConfig {
    service_multiplier: f64,
    retail_multiplier: f64,
    service_dispersion: f64,
    retail_dispersion: f64,
    service_log_shift: f64,
    retail_log_shift: f64,
    recipe_log_shift: f64,
    adjustment_mean: f64,
    adjustment_std: f64,
}

fn sample_regime(
    rng: &mut StdRng,
    interval: &PreprocessedInterval,
    ranking_pressure: f64,
    stockout_pressure: f64,
    price_pressure: f64,
    correction_pressure: f64,
    change_point: bool,
) -> &'static str {
    let service_discount = mean(
        &interval
            .centered_service_prices
            .values()
            .map(|value| (-value).max(0.0))
            .collect::<Vec<_>>(),
    );
    let retail_discount = mean(
        &interval
            .centered_retail_prices
            .values()
            .map(|value| (-value).max(0.0))
            .collect::<Vec<_>>(),
    );
    let mut logits = vec![
        0.2,
        0.15 + ranking_pressure * 0.15 + price_pressure * 0.08,
        0.12 + if ranking_pressure == 0.0 { 0.35 } else { 0.0 },
        0.08 + stockout_pressure * 0.70,
        0.10 + (service_discount + retail_discount) * 0.8,
        0.05 + correction_pressure * 0.9,
    ];
    if change_point {
        logits[4] += 0.25;
        logits[5] += 0.25;
    }
    sample_categorical_softmax(rng, &logits)
}

fn sample_categorical_softmax(rng: &mut StdRng, logits: &[f64]) -> &'static str {
    let max_logit = logits.iter().copied().fold(f64::NEG_INFINITY, f64::max);
    let weights = logits
        .iter()
        .map(|logit| (logit - max_logit).exp())
        .collect::<Vec<_>>();
    let total = weights.iter().sum::<f64>().max(1e-8);
    let mut draw = rng.gen::<f64>() * total;
    for (index, weight) in weights.iter().enumerate() {
        draw -= *weight;
        if draw <= 0.0 {
            return REGIMES[index];
        }
    }
    REGIMES[REGIMES.len() - 1]
}

fn resample_particles(
    results: &[IntervalParticleResult],
    weights: &[f64],
    rng: &mut StdRng,
) -> Vec<Particle> {
    let mut cumulative = Vec::with_capacity(weights.len());
    let mut running = 0.0;
    for weight in weights {
        running += *weight;
        cumulative.push(running);
    }
    let mut particles = Vec::with_capacity(results.len());
    for _ in 0..results.len() {
        let draw = rng.gen::<f64>();
        let index = cumulative
            .iter()
            .position(|threshold| *threshold >= draw)
            .unwrap_or(cumulative.len().saturating_sub(1));
        particles.push(results[index].particle.clone());
    }
    particles
}

fn compute_stockout_hit(
    starting_inventory: f64,
    receipt_events: &[(f64, f64)],
    total_demand: f64,
    adjustment: f64,
    start_day: f64,
    end_day: f64,
) -> bool {
    let mut events = receipt_events.to_vec();
    events.sort_by(|left, right| {
        left.0
            .partial_cmp(&right.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut inventory = starting_inventory;
    let mut previous_time = start_day;
    let duration = (end_day - start_day).max(1e-6);
    let demand_rate = total_demand / duration;
    for (arrival_time, quantity) in events {
        let elapsed = (arrival_time - previous_time).max(0.0);
        inventory = (inventory - demand_rate * elapsed).max(0.0);
        if inventory <= 1e-6 {
            return true;
        }
        inventory += quantity;
        previous_time = arrival_time;
    }
    inventory = (inventory - demand_rate * (end_day - previous_time).max(0.0)).max(0.0);
    if inventory <= 1e-6 {
        return true;
    }
    (inventory + adjustment).max(0.0) <= 1e-6
}

fn gaussian_logpdf(value: f64, mean: f64, sigma: f64) -> f64 {
    let sigma = sigma.max(1e-6);
    let z = (value - mean) / sigma;
    -0.5 * z.powi(2) - sigma.ln()
}

fn event_loglik(observed_true: bool, latent_true: bool, match_probability: f64) -> f64 {
    let probability = if observed_true == latent_true {
        match_probability
    } else {
        1.0 - match_probability
    };
    probability.max(1e-8).ln()
}

fn effective_sample_size(weights: &[f64]) -> f64 {
    let sum_sq = weights
        .iter()
        .map(|weight| weight.powi(2))
        .sum::<f64>()
        .max(1e-12);
    1.0 / sum_sq
}

fn normalize_weights(weights: &[f64]) -> Vec<f64> {
    let total = weights.iter().sum::<f64>().max(1e-12);
    weights.iter().map(|weight| weight / total).collect()
}

fn weighted_mean(values: &[f64], weights: &[f64]) -> f64 {
    if values.is_empty() || weights.is_empty() {
        return 0.0;
    }
    values
        .iter()
        .zip(weights.iter())
        .map(|(value, weight)| value * weight)
        .sum()
}

fn weighted_variance(values: &[f64], weights: &[f64], mean_value: f64) -> f64 {
    if values.is_empty() || weights.is_empty() {
        return 0.0;
    }
    values
        .iter()
        .zip(weights.iter())
        .map(|(value, weight)| weight * (value - mean_value).powi(2))
        .sum()
}

fn compute_reorder_quantity_recommendation(
    inventory_draws: &[f64],
    pipeline_draws: &[f64],
    demand_rate_draws: &[f64],
    lead_time_draws: &[f64],
    weights: &[f64],
    parameters: &SenaEngineParameters,
) -> SenaReorderQuantityRecommendation {
    let gaps = inventory_draws
        .iter()
        .zip(pipeline_draws.iter())
        .zip(demand_rate_draws.iter())
        .zip(lead_time_draws.iter())
        .map(|(((inventory, pipeline), demand_rate), lead_time)| {
            let inventory_position = inventory + pipeline;
            let protection_horizon = lead_time + parameters.review_delay_days;
            (demand_rate * protection_horizon - inventory_position).max(0.0)
        })
        .collect::<Vec<_>>();
    let need_probability = gaps
        .iter()
        .zip(weights.iter())
        .map(|(gap, weight)| if *gap > 0.0 { *weight } else { 0.0 })
        .sum::<f64>()
        .clamp(0.0, 1.0);
    let ungated_recommended_units =
        weighted_quantile(&gaps, weights, parameters.recommendation_quantile).max(0.0);
    let likely_range_low =
        weighted_quantile(&gaps, weights, parameters.interval_low_quantile).max(0.0);
    let likely_range_high =
        weighted_quantile(&gaps, weights, parameters.interval_high_quantile).max(0.0);
    let recommendation_issued =
        need_probability > parameters.need_probability_gate && ungated_recommended_units > 0.0;

    SenaReorderQuantityRecommendation {
        recommended_units: if recommendation_issued {
            ungated_recommended_units
        } else {
            0.0
        },
        ungated_recommended_units,
        likely_range_low,
        likely_range_high,
        need_probability,
        recommendation_issued,
        recommendation_quantile: parameters.recommendation_quantile,
        interval_low_quantile: parameters.interval_low_quantile,
        interval_high_quantile: parameters.interval_high_quantile,
        need_probability_gate: parameters.need_probability_gate,
        review_delay_days: parameters.review_delay_days,
    }
}

fn weighted_quantile(values: &[f64], weights: &[f64], q: f64) -> f64 {
    if values.is_empty() || weights.is_empty() {
        return 0.0;
    }
    let mut pairs = values
        .iter()
        .copied()
        .zip(weights.iter().copied())
        .collect::<Vec<_>>();
    pairs.sort_by(|left, right| {
        left.0
            .partial_cmp(&right.0)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let threshold = q.clamp(0.0, 1.0);
    let mut running = 0.0;
    for (value, weight) in pairs {
        running += weight;
        if running >= threshold {
            return value;
        }
    }
    values.last().copied().unwrap_or(0.0)
}

fn normal_quantile(probability: f64) -> f64 {
    let target = probability.clamp(0.001, 0.999);
    let mut low = -4.0;
    let mut high = 4.0;
    for _ in 0..48 {
        let mid = (low + high) / 2.0;
        if normal_cdf(mid) < target {
            low = mid;
        } else {
            high = mid;
        }
    }
    ((low + high) / 2.0).max(0.0)
}

fn normal_cdf(value: f64) -> f64 {
    0.5 * (1.0 + erf(value / 2.0_f64.sqrt()))
}

fn erf(value: f64) -> f64 {
    let sign = if value < 0.0 { -1.0 } else { 1.0 };
    let x = value.abs();
    let t = 1.0 / (1.0 + 0.3275911 * x);
    let y = 1.0
        - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t
            + 0.254829592)
            * t
            * (-x * x).exp();
    sign * y
}

fn sample_count(mean: f64, variance: f64, rng: &mut StdRng) -> u64 {
    if mean <= 0.0 {
        return 0;
    }
    let variance = variance.max(mean);
    let draw = mean + sample_normal(rng) * variance.sqrt();
    draw.round().max(0.0) as u64
}

fn sample_positive(rng: &mut StdRng, mean: f64, scale: f64) -> f64 {
    (mean + sample_normal(rng) * (mean.abs().sqrt() * scale + 0.1)).max(0.0)
}

fn sample_lognormal_from_location(rng: &mut StdRng, mu: f64, sigma: f64) -> f64 {
    (mu + sample_normal(rng) * sigma.max(1e-6)).exp()
}

fn sample_lognormal_mean_variance(rng: &mut StdRng, mean: f64, variance: f64) -> f64 {
    let sigma = ((1.0 + variance / mean.max(0.5).powi(2)).ln()).sqrt();
    sample_lognormal_mean_std(rng, mean, sigma)
}

fn sample_lognormal_mean_std(rng: &mut StdRng, mean: f64, sigma: f64) -> f64 {
    let sigma = sigma.max(1e-6);
    let mu = mean.max(0.5).ln() - 0.5 * sigma.powi(2);
    sample_lognormal_from_location(rng, mu, sigma)
}

fn heavy_tailed_shock(rng: &mut StdRng, scale: f64) -> f64 {
    let base = sample_normal(rng) * scale;
    if rng.gen::<f64>() < 0.08 {
        base * 2.8
    } else {
        base
    }
}

fn sample_normal(rng: &mut StdRng) -> f64 {
    let u1 = rng.gen::<f64>().clamp(f64::MIN_POSITIVE, 1.0);
    let u2 = rng.gen::<f64>();
    (-2.0 * u1.ln()).sqrt() * (2.0 * std::f64::consts::PI * u2).cos()
}

fn logistic(value: f64) -> f64 {
    1.0 / (1.0 + (-value).exp())
}

fn month_to_index(month: Month) -> usize {
    match month {
        Month::January => 0,
        Month::February => 1,
        Month::March => 2,
        Month::April => 3,
        Month::May => 4,
        Month::June => 5,
        Month::July => 6,
        Month::August => 7,
        Month::September => 8,
        Month::October => 9,
        Month::November => 10,
        Month::December => 11,
    }
}

fn mean_particle_seasonality_magnitude(particles: &[Particle]) -> f64 {
    let mut values = Vec::new();
    for particle in particles {
        for service_effect in &particle.seasonality_dow {
            values.extend(service_effect.iter().map(|value| value.abs()));
        }
        for service_effect in &particle.seasonality_month {
            values.extend(service_effect.iter().map(|value| value.abs()));
        }
    }
    mean(&values)
}

fn smooth_inventory_traces(traces: &mut [Vec<SenaTrajectoryPoint>]) {
    for trace in traces {
        if trace.len() < 3 {
            continue;
        }
        for index in (1..trace.len() - 1).rev() {
            trace[index].mean =
                (trace[index - 1].mean + trace[index].mean + trace[index + 1].mean) / 3.0;
            trace[index].low =
                (trace[index - 1].low + trace[index].low + trace[index + 1].low) / 3.0;
            trace[index].high =
                (trace[index - 1].high + trace[index].high + trace[index + 1].high) / 3.0;
        }
    }
}

fn mean(values: &[f64]) -> f64 {
    if values.is_empty() {
        0.0
    } else {
        values.iter().sum::<f64>() / values.len() as f64
    }
}

fn quantile(values: &[f64], q: f64) -> f64 {
    if values.is_empty() {
        return 0.0;
    }
    let mut sorted = values.to_vec();
    sorted.sort_by(|left, right| left.partial_cmp(right).unwrap_or(std::cmp::Ordering::Equal));
    let index = ((sorted.len() - 1) as f64 * q.clamp(0.0, 1.0)).round() as usize;
    sorted[index]
}

fn stable_seed(value: &impl std::fmt::Debug) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    format!("{value:?}").hash(&mut hasher);
    hasher.finish()
}

#[cfg(test)]
mod tests {
    #[cfg(feature = "desktop")]
    use super::{available_particle_workers, particle_pool_init_count};
    use super::{
        compute_reorder_quantity_recommendation, compute_stockout_hit, effective_sample_size,
        fingerprint_catalog, fingerprint_observations, normalize_weights, preprocess_workspace,
        run_analysis, run_preprocessed_analysis, weighted_mean, weighted_quantile,
        SenaEngineParameters,
    };
    use crate::types::{
        SenaCatalog, SenaLeadTimeHint, SenaObservationInput, SenaObservationRecord,
        SenaOrderSignal, SenaService, SenaServiceSkuMaskEntry, SenaSku, SenaStockSnapshot,
    };

    fn sample_catalog() -> SenaCatalog {
        SenaCatalog {
            schema_version: crate::types::SENA_SCHEMA_VERSION,
            skus: vec![SenaSku {
                sku_id: "sku-1".to_string(),
                name: "SKU 1".to_string(),
                description: "Inventory".to_string(),
                image_path: None,
                supplier_name: Some("Seed supplier".to_string()),
                cost_per_unit: 2.0,
                archived: false,
                sold_as_product: true,
                product_price: Some(5.0),
                lead_time_mean_days_hint: Some(2.0),
                lead_time_std_days_hint: Some(1.0),
            }],
            services: vec![SenaService {
                service_id: "svc-1".to_string(),
                name: "Service".to_string(),
                description: "Linked service".to_string(),
                image_path: None,
                price: 10.0,
                archived: false,
                bundle: true,
            }],
            bundles: Vec::new(),
            sharing_mask: vec![SenaServiceSkuMaskEntry {
                service_id: "svc-1".to_string(),
                sku_id: "sku-1".to_string(),
                enabled: true,
                usage_probability: Some(1.0),
            }],
        }
    }

    fn observation(
        observed_at: &str,
        units_in_stock: f64,
        service_stockout: bool,
        receipt_arrived: bool,
        service_price: f64,
    ) -> SenaObservationRecord {
        SenaObservationRecord {
            observation_id: format!("obs-{observed_at}"),
            owner_sub: "owner".to_string(),
            input: SenaObservationInput {
                observed_at: observed_at.to_string(),
                stock_snapshot: vec![SenaStockSnapshot {
                    sku_id: "sku-1".to_string(),
                    units_in_stock,
                    cost_per_unit: Some(2.0),
                    product_price: Some(5.0),
                }],
                retail_sales_snapshot: Vec::new(),
                service_sales_snapshot: Vec::new(),
                service_rankings: vec!["svc-1".to_string()],
                retail_rankings: vec!["sku-1".to_string()],
                service_stockouts: if service_stockout {
                    vec!["svc-1".to_string()]
                } else {
                    Vec::new()
                },
                retail_stockouts: if service_stockout {
                    vec!["sku-1".to_string()]
                } else {
                    Vec::new()
                },
                order_signals: vec![SenaOrderSignal {
                    sku_id: "sku-1".to_string(),
                    order_placed: receipt_arrived,
                    receipt_arrived,
                    approximate_order_quantity: Some(6.0),
                    approximate_receipt_quantity: Some(4.0),
                    placement_timestamp: Some(observed_at.to_string()),
                    receipt_timestamp: receipt_arrived.then(|| observed_at.to_string()),
                    lead_time_days_hint: Some(2.0),
                }],
                service_prices: vec![crate::types::SenaServicePriceObservation {
                    service_id: "svc-1".to_string(),
                    price: service_price,
                }],
                retail_prices: vec![crate::types::SenaRetailPriceObservation {
                    sku_id: "sku-1".to_string(),
                    price: 5.0,
                }],
                lead_time_hints: vec![SenaLeadTimeHint {
                    sku_id: "sku-1".to_string(),
                    typical_days: Some(2.0),
                    low_days: Some(1.0),
                    high_days: Some(3.0),
                    variability_class: None,
                }],
                regime_hint: None,
                adjustment_signals: Vec::new(),
                commercial_events: Vec::new(),
                ticket_events: Vec::new(),
                delivery_fee: None,
                discount: None,
                recipe_usage_hints: Vec::new(),
                notes: None,
            },
        }
    }

    fn many_observations() -> Vec<SenaObservationRecord> {
        vec![
            observation("2026-04-01T00:00:00Z", 24.0, false, false, 12.0),
            observation("2026-04-02T00:00:00Z", 22.0, false, false, 11.8),
            observation("2026-04-03T00:00:00Z", 20.0, false, false, 11.6),
            observation("2026-04-04T00:00:00Z", 18.0, false, false, 11.4),
            observation("2026-04-05T00:00:00Z", 16.0, false, true, 11.0),
            observation("2026-04-06T00:00:00Z", 19.0, false, false, 10.8),
            observation("2026-04-07T00:00:00Z", 15.0, false, false, 10.7),
            observation("2026-04-08T00:00:00Z", 13.0, true, false, 10.5),
            observation("2026-04-09T00:00:00Z", 11.0, false, false, 10.4),
            observation("2026-04-10T00:00:00Z", 9.0, false, true, 10.2),
        ]
    }

    #[test]
    fn stockout_path_detects_within_interval_depletion() {
        let hit = compute_stockout_hit(3.0, &[(1.5, 2.0)], 10.0, 0.0, 1.0, 2.0);
        assert!(hit);
    }

    #[test]
    fn preprocessing_sorts_offset_observations_chronologically() {
        let catalog = sample_catalog();
        let observations = vec![
            observation("2026-04-01T01:00:00-05:00", 4.0, false, false, 12.0),
            observation("2026-04-01T05:00:00Z", 10.0, false, false, 12.0),
        ];

        let preprocessed =
            preprocess_workspace(&catalog, &observations).expect("preprocessing should succeed");

        assert_eq!(preprocessed.initial_inventory[0], 10.0);
        assert_eq!(preprocessed.intervals[0].start_at, "2026-04-01T05:00:00Z");
        assert_eq!(
            preprocessed.intervals[0].end_at,
            "2026-04-01T01:00:00-05:00"
        );
    }

    #[test]
    fn weighted_helpers_favor_high_weight_particle() {
        let weights = normalize_weights(&[1.0, 9.0]);
        assert!(effective_sample_size(&weights) < 2.0);
        assert_eq!(weighted_quantile(&[1.0, 9.0], &weights, 0.5), 9.0);
        assert!(weighted_mean(&[1.0, 9.0], &weights) > 8.0);
    }

    #[test]
    fn reorder_quantity_recommends_when_protection_gap_is_likely_positive() {
        let recommendation = compute_reorder_quantity_recommendation(
            &[0.0, 1.0, 2.0],
            &[0.0, 0.0, 0.0],
            &[3.0, 3.0, 3.0],
            &[2.0, 2.0, 2.0],
            &[0.2, 0.3, 0.5],
            &SenaEngineParameters::default(),
        );

        assert!(recommendation.recommendation_issued);
        assert!(recommendation.recommended_units > 0.0);
        assert_eq!(
            recommendation.recommended_units,
            recommendation.ungated_recommended_units
        );
        assert_eq!(recommendation.need_probability, 1.0);
        assert_eq!(recommendation.recommendation_quantile, 0.70);
        assert_eq!(recommendation.interval_low_quantile, 0.10);
        assert_eq!(recommendation.interval_high_quantile, 0.90);
        assert_eq!(recommendation.need_probability_gate, 0.50);
    }

    #[test]
    fn reorder_quantity_suppresses_final_recommendation_below_need_gate() {
        let recommendation = compute_reorder_quantity_recommendation(
            &[100.0, 100.0, 0.0],
            &[0.0, 0.0, 0.0],
            &[1.0, 1.0, 1.0],
            &[1.0, 1.0, 1.0],
            &[0.4, 0.4, 0.2],
            &SenaEngineParameters::default(),
        );

        assert!(!recommendation.recommendation_issued);
        assert_eq!(recommendation.recommended_units, 0.0);
        assert!(recommendation.need_probability > 0.0);
        assert!(recommendation.need_probability < recommendation.need_probability_gate);
    }

    #[test]
    fn analysis_reports_added_interval_and_lead_time_fields() {
        let catalog = sample_catalog();
        let observations = vec![
            observation("2026-04-01T00:00:00Z", 12.0, false, false, 12.0),
            observation("2026-04-03T00:00:00Z", 2.0, true, true, 8.0),
        ];
        let (result, _) = run_analysis("owner", &catalog, &observations, "sena-analysis-v3")
            .expect("analysis should succeed");
        let interval = &result.sku_details[0].demand_posterior[0];
        assert!(interval.lost_demand_mean >= 0.0);
        assert!(interval.inventory_position_mean >= 0.0);
        let lead_time = &result.sku_details[0].lead_time_posterior[0];
        assert!(lead_time.variance_days_squared > 0.0);
        assert!(lead_time.shape_sigma > 0.0);
        assert_eq!(
            result.diagnostics.change_point_probability,
            result.diagnostics.latest_change_point_probability
        );
        let reorder_quantity = &result.sku_details[0].summary.reorder_quantity;
        assert!(reorder_quantity.need_probability >= 0.0);
        assert!(reorder_quantity.ungated_recommended_units >= 0.0);
        assert_eq!(reorder_quantity.recommendation_quantile, 0.70);
        assert_eq!(reorder_quantity.review_delay_days, 0.0);
        assert_eq!(
            result.service_details[0].contributors[0].reorder_quantity,
            Some(reorder_quantity.clone())
        );
    }

    #[test]
    fn analysis_rejects_invalid_catalog_and_observation_inputs() {
        let mut invalid_catalog = sample_catalog();
        invalid_catalog.services[0].price = -1.0;
        let observations = vec![
            observation("2026-04-01T00:00:00Z", 10.0, false, false, 10.0),
            observation("2026-04-02T00:00:00Z", 8.0, false, false, 10.0),
        ];

        let catalog_error =
            run_analysis("owner", &invalid_catalog, &observations, "sena-analysis-v3")
                .expect_err("invalid catalog should fail before preprocessing");
        assert!(catalog_error
            .to_string()
            .contains("service price must be >= 0"));

        let catalog = sample_catalog();
        let mut invalid_observations = observations;
        invalid_observations[1].input.service_prices[0].price = f64::INFINITY;
        let observation_error =
            run_analysis("owner", &catalog, &invalid_observations, "sena-analysis-v3")
                .expect_err("invalid observation should fail before preprocessing");
        assert!(observation_error
            .to_string()
            .contains("servicePrices[].price must be >= 0"));
    }

    #[test]
    fn stockout_flag_increases_reported_stockout_risk() {
        let catalog = sample_catalog();
        let without_flag = vec![
            observation("2026-04-01T00:00:00Z", 10.0, false, false, 12.0),
            observation("2026-04-03T00:00:00Z", 4.0, false, false, 12.0),
        ];
        let with_flag = vec![
            observation("2026-04-01T00:00:00Z", 10.0, false, false, 12.0),
            observation("2026-04-03T00:00:00Z", 4.0, true, false, 12.0),
        ];
        let (without_result, _) =
            run_analysis("owner", &catalog, &without_flag, "sena-analysis-v3")
                .expect("analysis should succeed");
        let (with_result, _) = run_analysis("owner", &catalog, &with_flag, "sena-analysis-v3")
            .expect("analysis should succeed");
        assert!(
            with_result.workspace_summary.sku_summaries[0].stockout_risk
                >= without_result.workspace_summary.sku_summaries[0].stockout_risk
        );
    }

    #[test]
    fn input_fingerprints_change_when_catalog_or_observations_change() {
        let catalog = sample_catalog();
        let observations = many_observations();
        let original_catalog =
            fingerprint_catalog(&catalog).expect("catalog fingerprint should compute");
        let original_observations = fingerprint_observations(&observations)
            .expect("observation fingerprint should compute");

        let mut changed_catalog = catalog.clone();
        changed_catalog.skus[0].name = "Renamed SKU".to_string();
        assert_ne!(
            original_catalog,
            fingerprint_catalog(&changed_catalog)
                .expect("changed catalog fingerprint should compute")
        );

        let mut changed_observations = observations.clone();
        changed_observations[3].input.stock_snapshot[0].units_in_stock += 1.0;
        assert_ne!(
            original_observations,
            fingerprint_observations(&changed_observations)
                .expect("changed observation fingerprint should compute")
        );
    }

    #[test]
    fn resumed_run_matches_full_run() {
        let catalog = sample_catalog();
        let observations = many_observations();
        let preprocessed =
            preprocess_workspace(&catalog, &observations).expect("preprocessing should succeed");

        let full = run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            Some(4),
        )
        .expect("full run should succeed");
        let checkpoint = full
            .checkpoints
            .iter()
            .find(|checkpoint| checkpoint.metadata.completed_interval_count == 8)
            .cloned()
            .expect("checkpoint after eight intervals should exist");
        let resumed = run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            Some(&checkpoint),
            Some(4),
        )
        .expect("resumed run should succeed");

        assert_eq!(
            full.result.workspace_summary,
            resumed.result.workspace_summary
        );
        assert_eq!(full.result.sku_details, resumed.result.sku_details);
        assert_eq!(full.result.service_details, resumed.result.service_details);
        assert_eq!(full.result.diagnostics, resumed.result.diagnostics);
    }

    #[test]
    fn repeated_runs_are_bit_identical() {
        let catalog = sample_catalog();
        let observations = many_observations();
        let preprocessed =
            preprocess_workspace(&catalog, &observations).expect("preprocessing should succeed");

        let first = run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            Some(4),
        )
        .expect("first run should succeed");
        let second = run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            Some(4),
        )
        .expect("second run should succeed");

        assert_eq!(
            first.result.workspace_summary,
            second.result.workspace_summary
        );
        assert_eq!(first.result.sku_details, second.result.sku_details);
        assert_eq!(first.result.service_details, second.result.service_details);
        assert_eq!(first.result.diagnostics, second.result.diagnostics);
    }

    #[cfg(feature = "desktop")]
    #[test]
    fn particle_pool_is_reused_and_worker_count_has_floor() {
        let catalog = sample_catalog();
        let observations = many_observations();
        let preprocessed =
            preprocess_workspace(&catalog, &observations).expect("preprocessing should succeed");

        let before = particle_pool_init_count();
        assert!(available_particle_workers() >= 1);

        run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            Some(4),
        )
        .expect("first run should succeed");
        let after_first = particle_pool_init_count();

        run_preprocessed_analysis(
            "owner",
            &catalog,
            &observations,
            "sena-analysis-v3",
            &preprocessed,
            None,
            Some(4),
        )
        .expect("second run should succeed");
        let after_second = particle_pool_init_count();

        assert_eq!(after_first, before + 1);
        assert_eq!(after_second, after_first);
    }
}
