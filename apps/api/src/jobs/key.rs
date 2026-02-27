use sha2::{Digest, Sha256};

pub fn derive_job_key(
    producer_service: &str,
    job_type: &str,
    aggregate_type: &str,
    aggregate_id: &str,
    causation_id: &str,
) -> String {
    let raw =
        format!("{producer_service}|{job_type}|{aggregate_type}|{aggregate_id}|{causation_id}");
    let mut hasher = Sha256::new();
    hasher.update(raw.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::derive_job_key;

    #[test]
    fn job_key_is_deterministic_and_identity_bound() {
        let a = derive_job_key("api", "item-created", "item", "user-1:item-1", "idem-1");
        let b = derive_job_key("api", "item-created", "item", "user-1:item-1", "idem-1");
        let c = derive_job_key("api", "item-created", "item", "user-1:item-2", "idem-1");

        assert_eq!(a, b);
        assert_ne!(a, c);
    }
}
