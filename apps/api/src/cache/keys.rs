#[derive(Clone, Debug)]
pub struct KeyBuilder {
    system: String,
    env: String,
    service: String,
    schema_version: String,
}

impl KeyBuilder {
    pub fn new(system: String, env: String, service: String, schema_version: String) -> Self {
        Self {
            system,
            env,
            service,
            schema_version,
        }
    }

    pub fn build(&self, domain: &str, segments: &[&str]) -> String {
        let mut parts = vec![
            encode_segment(&self.system),
            encode_segment(&self.env),
            encode_segment(&self.service),
            encode_segment(&self.schema_version),
            encode_segment(domain),
        ];
        parts.extend(segments.iter().map(|s| encode_segment(s)));
        parts.join(":")
    }

    pub fn idempotency_result_key(&self, caller_id: &str, idem_key: &str) -> String {
        self.build("idem", &[caller_id, idem_key])
    }

    pub fn cache_key(&self, entity: &str, id: &str) -> String {
        self.build("cache", &[entity, id])
    }

    pub fn inventory_item_key(&self, owner_sub: &str, item_id: &str) -> String {
        self.build("cache", &["inventory:item", owner_sub, item_id])
    }
}

fn encode_segment(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for b in raw.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' {
            out.push(char::from(b));
        } else {
            out.push('~');
            out.push_str(&format!("{b:02X}"));
        }
    }
    out
}
