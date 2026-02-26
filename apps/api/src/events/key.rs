use sha2::{Digest, Sha256};

pub fn derive_publish_key(
    producer_service: &str,
    event_type: &str,
    aggregate_type: &str,
    aggregate_id: &str,
    causation_id: &str,
) -> String {
    let raw =
        format!("{producer_service}|{event_type}|{aggregate_type}|{aggregate_id}|{causation_id}");
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::derive_publish_key;

    #[test]
    fn publish_key_is_deterministic_and_distinguishes_event_identity() {
        let a = derive_publish_key("api", "inventory.created", "item", "item-1", "idem-1");
        let b = derive_publish_key("api", "inventory.created", "item", "item-1", "idem-1");
        let c = derive_publish_key("api", "inventory.created", "item", "item-2", "idem-1");

        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
