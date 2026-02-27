use std::collections::{BTreeMap, HashMap};

pub fn normalize_metadata_case_insensitive(
    metadata: impl IntoIterator<Item = (String, String)>,
) -> BTreeMap<String, String> {
    metadata
        .into_iter()
        .map(|(key, value)| (key.to_ascii_lowercase(), value))
        .collect()
}

pub fn normalize_metadata_map(metadata: &HashMap<String, String>) -> BTreeMap<String, String> {
    normalize_metadata_case_insensitive(
        metadata
            .iter()
            .map(|(key, value)| (key.clone(), value.clone())),
    )
}

pub fn metadata_value<'a>(metadata: &'a BTreeMap<String, String>, key: &str) -> Option<&'a str> {
    metadata.get(&key.to_ascii_lowercase()).map(String::as_str)
}
