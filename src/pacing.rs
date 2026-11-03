//! Phone normalization, template variable interpolation, and anti-ban pacing simulation.

use rand::Rng;
/// Normalizes a raw phone number into standard E.164 and WhatsApp JID.
///
/// Returns `Some((phone_e164, jid))` if valid (7 to 15 digits).
pub fn normalize_phone_number(raw: &str) -> Option<(String, String)> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Extract digits only
    let mut digits = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_ascii_digit() {
            digits.push(ch);
        }
    }

    // Strip leading international double zeroes (00...)
    let digits = if digits.starts_with("00") && digits.len() > 2 {
        &digits[2..]
    } else {
        &digits[..]
    };

    // E.164 standard specifies 7 to 15 digits
    if digits.len() < 7 || digits.len() > 15 {
        return None;
    }

    let phone_e164 = format!("+{digits}");
    let jid = format!("{digits}@s.whatsapp.net");
    Some((phone_e164, jid))
}

/// Interpolates template tokens such as `{{name}}`, `{{first_name}}`, `{{phone}}`, `{{jid}}`,
/// and any custom properties present in `custom_fields_json`.
pub fn interpolate_template(
    template: &str,
    display_name: Option<&str>,
    phone_number: &str,
    jid: &str,
    custom_fields_json: Option<&str>,
) -> String {
    let mut result = template.to_string();

    let full_name = display_name.unwrap_or_default().trim();
    let first_name = full_name.split_whitespace().next().unwrap_or_default();

    // Standard variable replacements
    result = replace_token_variations(&result, "name", full_name);
    result = replace_token_variations(&result, "first_name", first_name);
    result = replace_token_variations(&result, "phone", phone_number);
    result = replace_token_variations(&result, "phone_number", phone_number);
    result = replace_token_variations(&result, "jid", jid);

    // Custom fields from JSON if provided
    if let Some(json_str) = custom_fields_json {
        if let Ok(serde_json::Value::Object(map)) = serde_json::from_str::<serde_json::Value>(json_str) {
            for (key, val) in map {
                let string_val = match val {
                    serde_json::Value::String(s) => s,
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    other => other.to_string(),
                };
                result = replace_token_variations(&result, &key, &string_val);
            }
        }
    }

    result
}

fn replace_token_variations(text: &str, key: &str, value: &str) -> String {
    let lower_key = key.to_lowercase();
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();

    // Token matching supporting both {{token}} and {token}
    while let Some(c) = chars.next() {
        if c == '{' {
            let is_double = chars.peek() == Some(&'{');
            if is_double {
                chars.next(); // consume second '{'
            }

            let mut token_name = String::new();
            let mut closed = false;

            while let Some(&tc) = chars.peek() {
                if tc == '}' {
                    chars.next();
                    if is_double && chars.peek() == Some(&'}') {
                        chars.next();
                    }
                    closed = true;
                    break;
                } else if tc == '\n' || tc == '{' {
                    break;
                } else {
                    token_name.push(tc);
                    chars.next();
                }
            }

            if closed && token_name.trim().to_lowercase() == lower_key {
                output.push_str(value);
            } else {
                output.push('{');
                if is_double {
                    output.push('{');
                }
                output.push_str(&token_name);
                if closed {
                    output.push('}');
                    if is_double {
                        output.push('}');
                    }
                }
            }
        } else {
            output.push(c);
        }
    }

    output
}

/// Calculates dynamic typing simulation duration in milliseconds:
/// clamp(len * (30..=50) ms, 1500, 8000)
pub fn calculate_typing_duration_ms(text_len: usize) -> u64 {
    let mut rng = rand::rng();
    let ms_per_char: u64 = rng.random_range(30..=50);
    (text_len as u64 * ms_per_char).clamp(1500, 8000)
}

/// Calculates jitter cooldown delay in seconds between recipients:
/// random in [min_secs, max_secs] (min clamped to >= 10s)
pub fn calculate_jitter_delay_secs(min_secs: u32, max_secs: u32) -> u64 {
    let min_s = min_secs.max(10) as u64;
    let max_s = max_secs.max(min_s as u32) as u64;
    let mut rng = rand::rng();
    rng.random_range(min_s..=max_s)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_phone_normalization() {
        let (phone, jid) = normalize_phone_number("+62 (859) 2255-4688").unwrap();
        assert_eq!(phone, "+6285922554688");
        assert_eq!(jid, "6285922554688@s.whatsapp.net");

        let (phone2, jid2) = normalize_phone_number("0014155552671").unwrap();
        assert_eq!(phone2, "+14155552671");
        assert_eq!(jid2, "14155552671@s.whatsapp.net");

        assert!(normalize_phone_number("12345").is_none());
    }

    #[test]
    fn test_template_interpolation() {
        let template = "Hello {{name}} (or should I call you {first_name}?), your number is {{phone}} and discount code is {{discount}}!";
        let custom = r#"{"discount": "VIP2026"}"#;
        let res = interpolate_template(
            template,
            Some("Johnathan Doe"),
            "+1234567890",
            "1234567890@s.whatsapp.net",
            Some(custom),
        );
        assert_eq!(
            res,
            "Hello Johnathan Doe (or should I call you Johnathan?), your number is +1234567890 and discount code is VIP2026!"
        );
    }

    #[test]
    fn test_timing_ranges() {
        let typing_short = calculate_typing_duration_ms(5);
        assert!((1500..=8000).contains(&typing_short));

        let typing_long = calculate_typing_duration_ms(500);
        assert_eq!(typing_long, 8000);

        let jitter = calculate_jitter_delay_secs(25, 90);
        assert!((25..=90).contains(&jitter));
    }
}
