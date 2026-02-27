use banji_api::events::schema::{latest_version, registry_manifest};

#[test]
fn producer_paths_use_registered_event_builders() {
    let lib_src = include_str!("../src/lib.rs");
    assert!(lib_src.contains("build_inventory_item_created_v1"));
    assert!(lib_src.contains("build_inventory_write_demo_completed_v1"));

    assert!(latest_version("inventory.item.created").is_some());
    assert!(latest_version("inventory.write-demo.completed").is_some());
}

#[test]
fn docs_vocabulary_matches_registry_manifest() {
    let doc = include_str!("../../../docs/architecture/event-vocabulary-schema-discipline.md");
    for entry in registry_manifest() {
        assert!(
            doc.contains(entry.event_type),
            "docs missing event_type {}",
            entry.event_type
        );
        assert!(
            doc.contains(&format!("v{}", entry.latest_version)),
            "docs missing version marker v{}",
            entry.latest_version
        );
    }
}
