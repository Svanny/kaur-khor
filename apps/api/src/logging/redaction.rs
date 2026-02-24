const EXACT_SECRET_KEYS: &[&str] = &[
    "DATABASE_RUNTIME_URL",
    "DATABASE_MIGRATION_URL",
    "REDIS_URL",
    "RABBIT_URL",
    "OBJECT_STORAGE_ACCESS_KEY",
    "OBJECT_STORAGE_SECRET_KEY",
    "OTEL_HEADERS",
];

const SENSITIVE_MARKERS: &[&str] = &[
    "PASSWORD",
    "SECRET",
    "TOKEN",
    "API_KEY",
    "ACCESS_KEY",
    "AUTHORIZATION",
    "COOKIE",
    "SET_COOKIE",
];

pub fn is_sensitive_name(name: &str) -> bool {
    let normalized = name.to_ascii_uppercase().replace('-', "_");
    SENSITIVE_MARKERS
        .iter()
        .any(|marker| normalized.contains(marker))
}

pub fn redact_known_key_value(key: &str, value: &str) -> String {
    if is_sensitive_name(key) || EXACT_SECRET_KEYS.contains(&key) {
        "***".to_string()
    } else {
        value.to_string()
    }
}

pub fn redact_message(input: &str) -> String {
    let stripped = redact_url_userinfo(input);
    redact_secret_assignments(&stripped)
}

fn redact_secret_assignments(input: &str) -> String {
    let mut result = input.to_string();
    for key in EXACT_SECRET_KEYS {
        for separator in ["=", ":"] {
            let needle = format!("{key}{separator}");
            let mut search_from = 0;
            while let Some(rel_start) = result[search_from..].find(&needle) {
                let start = search_from + rel_start;
                let raw_value_start = start + needle.len();
                let whitespace_len = result[raw_value_start..]
                    .chars()
                    .take_while(|c| c.is_whitespace())
                    .map(char::len_utf8)
                    .sum::<usize>();
                let value_start = raw_value_start + whitespace_len;
                let value_end = result[value_start..]
                    .find(char::is_whitespace)
                    .map(|offset| value_start + offset)
                    .unwrap_or(result.len());
                if value_start < value_end {
                    result.replace_range(value_start..value_end, "***");
                    search_from = value_start + 3;
                } else {
                    search_from = raw_value_start;
                }
            }
        }
    }
    result
}

fn redact_url_userinfo(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let mut cursor = 0;

    while let Some(rel) = input[cursor..].find("://") {
        let scheme_sep = cursor + rel;
        let authority_start = scheme_sep + 3;
        out.push_str(&input[cursor..authority_start]);

        let remainder = &input[authority_start..];
        let authority_len = remainder
            .find(|c: char| c == '/' || c == '?' || c == '#' || c.is_whitespace())
            .unwrap_or(remainder.len());
        let authority = &remainder[..authority_len];

        if let Some(at_pos) = authority.rfind('@') {
            let userinfo = &authority[..at_pos];
            let host = &authority[at_pos + 1..];
            if !userinfo.is_empty() {
                out.push_str("***:***@");
                out.push_str(host);
            } else {
                out.push_str(authority);
            }
        } else {
            out.push_str(authority);
        }

        cursor = authority_start + authority_len;
    }

    out.push_str(&input[cursor..]);
    out
}
