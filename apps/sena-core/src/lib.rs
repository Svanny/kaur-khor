#[cfg(feature = "desktop")]
pub mod benchmark;
pub mod browser;
pub mod inference;
pub mod lead_time;
pub mod service;
#[cfg(feature = "desktop")]
pub mod sqlite;
pub mod types;

pub use browser::{
    run_browser_analysis, run_browser_analysis_json, BrowserSenaAnalysisInput,
    BrowserSenaAnalysisOutput,
};
pub use inference::{
    build_checkpoint_metadata, build_input_fingerprint, fingerprint_catalog,
    fingerprint_observation_prefix, fingerprint_observations, particle_count_for_algorithm,
    preprocess_workspace, run_analysis, run_analysis_with_parameters, run_preprocessed_analysis,
    run_preprocessed_analysis_with_parameters, AnalysisArtifacts, PreprocessedWorkspace,
    RunAnalysisOutput, SenaAnalysisCheckpoint, SenaAnalysisRuntimeState, SenaCheckpointMetadata,
    SenaEngineParameters, SenaInputFingerprint, SenaParticleState, SenaPosteriorSnapshot,
};
pub use lead_time::*;
pub use service::{
    execute_analysis_run, execute_analysis_run_with_parameters, now_rfc3339, trigger_analysis_run,
    SenaRepository,
};
#[cfg(feature = "desktop")]
pub use sqlite::SqliteSenaRepository;
pub use types::*;
