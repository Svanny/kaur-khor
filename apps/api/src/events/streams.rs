const INVENTORY_UPDATED_TOPIC: &str = "inventory-updated";
const SENA_ANALYSIS_COMPLETED_TOPIC: &str = "sena-analysis-completed";
const SENA_UPDATED_TOPIC: &str = "sena-updated";
const WRITE_DEMO_COMPLETED_TOPIC: &str = "write-demo-completed";

pub fn inventory_updated_stream(system: &str, env: &str) -> String {
    format!("{system}.{env}.{INVENTORY_UPDATED_TOPIC}")
}

pub fn write_demo_completed_stream(system: &str, env: &str) -> String {
    format!("{system}.{env}.{WRITE_DEMO_COMPLETED_TOPIC}")
}

pub fn sena_updated_stream(system: &str, env: &str) -> String {
    format!("{system}.{env}.{SENA_UPDATED_TOPIC}")
}

pub fn sena_analysis_completed_stream(system: &str, env: &str) -> String {
    format!("{system}.{env}.{SENA_ANALYSIS_COMPLETED_TOPIC}")
}

pub fn inventory_updated_topic() -> &'static str {
    INVENTORY_UPDATED_TOPIC
}

pub fn write_demo_completed_topic() -> &'static str {
    WRITE_DEMO_COMPLETED_TOPIC
}

pub fn sena_updated_topic() -> &'static str {
    SENA_UPDATED_TOPIC
}

pub fn sena_analysis_completed_topic() -> &'static str {
    SENA_ANALYSIS_COMPLETED_TOPIC
}
