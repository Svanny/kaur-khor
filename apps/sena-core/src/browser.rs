use crate::{
    inference::{run_analysis_with_parameters, AnalysisArtifacts, SenaEngineParameters},
    types::{SenaAnalysisResult, SenaCatalog, SenaObservationRecord},
};
use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSenaAnalysisInput {
    pub owner_sub: String,
    pub catalog: SenaCatalog,
    pub observations: Vec<SenaObservationRecord>,
    pub algorithm_version: String,
    pub parameters: Option<SenaEngineParameters>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BrowserSenaAnalysisOutput {
    pub result: SenaAnalysisResult,
    pub artifacts: AnalysisArtifacts,
}

pub fn run_browser_analysis(input: BrowserSenaAnalysisInput) -> Result<BrowserSenaAnalysisOutput> {
    let (result, artifacts) = run_analysis_with_parameters(
        &input.owner_sub,
        &input.catalog,
        &input.observations,
        &input.algorithm_version,
        input.parameters.as_ref(),
    )?;
    Ok(BrowserSenaAnalysisOutput { result, artifacts })
}

pub fn run_browser_analysis_json(input_json: &str) -> Result<String> {
    let input: BrowserSenaAnalysisInput = serde_json::from_str(input_json)?;
    Ok(serde_json::to_string(&run_browser_analysis(input)?)?)
}
