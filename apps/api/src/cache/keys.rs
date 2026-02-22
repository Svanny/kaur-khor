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
            sanitize(&self.system),
            sanitize(&self.env),
            sanitize(&self.service),
            sanitize(&self.schema_version),
            sanitize(domain),
        ];
        parts.extend(segments.iter().map(|s| sanitize(s)));
        parts.join(":")
    }

    pub fn idempotency_result_key(&self, caller_id: &str, idem_key: &str) -> String {
        self.build("idem", &[caller_id, idem_key])
    }

    pub fn cache_key(&self, entity: &str, id: &str) -> String {
        self.build("cache", &[entity, id])
    }
}

fn sanitize(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    for c in raw.chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            out.push(c.to_ascii_lowercase());
        } else {
            out.push('-');
        }
    }
    while out.contains("--") {
        out = out.replace("--", "-");
    }
    out.trim_matches('-').to_string()
}
