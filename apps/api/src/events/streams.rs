const INVENTORY_UPDATED_TOPIC: &str = "inventory-updated";
const WRITE_DEMO_COMPLETED_TOPIC: &str = "write-demo-completed";

pub fn inventory_updated_stream(system: &str, env: &str) -> String {
    format!("{system}.{env}.{INVENTORY_UPDATED_TOPIC}")
}

pub fn write_demo_completed_stream(system: &str, env: &str) -> String {
    format!("{system}.{env}.{WRITE_DEMO_COMPLETED_TOPIC}")
}

pub fn inventory_updated_topic() -> &'static str {
    INVENTORY_UPDATED_TOPIC
}

pub fn write_demo_completed_topic() -> &'static str {
    WRITE_DEMO_COMPLETED_TOPIC
}
