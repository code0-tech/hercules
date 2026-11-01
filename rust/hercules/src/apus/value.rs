//! Bridges [`crate::types::PlainValue`] (`serde_json::Value`) to
//! `apus_client::ApusValue`, the Apus wire value.
//!
//! Mirrors the `from_json`/`to_json` helpers in the apus repo's proof of
//! concept action (`apus/actions/http-action-rs/src/main.rs`): only the
//! literal subset (null/bool/int/float/string/list/object) round-trips —
//! `PlainValue` has no slot for the extra Apus variants (`Template`,
//! `SubFlow`, `Stream`, `Function`), so a value that is still one of those by
//! the time it reaches this bridge becomes `null` rather than failing.
//!
//! `SubFlow` handles specifically are *not* expected to reach
//! [`apus_to_plain`] at all: the call dispatch adapter
//! ([`crate::apus::handler`]) pulls a positional `CALL` argument that is a
//! sub-flow reference out *before* conversion (matching how the existing
//! gRPC path routes `ActionNodeValue::SubFlow` into
//! `FunctionContext::sub_flow_parameters` instead of a literal) — see
//! [`crate::types::FunctionContext::apus`].

use apus_client::ApusValue;

use crate::types::PlainValue;

/// `PlainValue` -> Apus. Used for outgoing values: a handler's returned
/// value, a flow's input payload, sub-flow call arguments.
pub fn plain_to_apus(value: &PlainValue) -> ApusValue {
    match value {
        PlainValue::Null => ApusValue::Null,
        PlainValue::Bool(b) => ApusValue::Bool(*b),
        PlainValue::Number(n) => n.as_i64().map(ApusValue::Int).unwrap_or_else(|| ApusValue::Float(n.as_f64().unwrap_or(0.0))),
        PlainValue::String(s) => ApusValue::String(s.clone()),
        PlainValue::Array(items) => ApusValue::List(items.iter().map(plain_to_apus).collect()),
        PlainValue::Object(map) => ApusValue::Object(map.iter().map(|(k, v)| (k.clone(), plain_to_apus(v))).collect()),
    }
}

/// Apus -> `PlainValue`. Used for incoming values: resolved `CALL`
/// arguments (after a top-level sub-flow reference has already been pulled
/// out by the caller), an `EXEC_RESULT`/`SUBFLOW_RESULT` payload.
///
/// `Template`, `SubFlow`, `Stream` and `Function` have no `PlainValue` form
/// and become `null` — by the point values reach the action's handler,
/// `apus_client` has already resolved templates and materialized streams
/// back into strings (see `apus/protocol/SPEC-v1.md`'s Values/Streams
/// sections), so only a top-level `SubFlow` is expected in practice, and
/// that is handled separately (see the module docs).
pub fn apus_to_plain(value: &ApusValue) -> PlainValue {
    match value {
        ApusValue::Null => PlainValue::Null,
        ApusValue::Bool(b) => PlainValue::Bool(*b),
        ApusValue::Int(i) => PlainValue::from(*i),
        ApusValue::Float(f) => PlainValue::from(*f),
        ApusValue::String(s) => PlainValue::String(s.clone()),
        ApusValue::List(items) => PlainValue::Array(items.iter().map(apus_to_plain).collect()),
        ApusValue::Object(fields) => PlainValue::Object(fields.iter().map(|(k, v)| (k.clone(), apus_to_plain(v))).collect()),
        ApusValue::Template { .. } | ApusValue::SubFlow { .. } | ApusValue::Stream { .. } | ApusValue::Function { .. } => PlainValue::Null,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literals_round_trip() {
        let plain = serde_json::json!({
            "a": 1,
            "b": 1.5,
            "c": "hi",
            "d": [true, false, null],
            "e": { "nested": 7 },
        });
        let apus = plain_to_apus(&plain);
        assert_eq!(apus_to_plain(&apus), plain);
    }

    #[test]
    fn large_integers_stay_exact() {
        let plain = serde_json::json!(1_i64 << 60);
        assert_eq!(plain_to_apus(&plain), ApusValue::Int(1 << 60));
    }

    #[test]
    fn extra_apus_variants_become_null() {
        assert_eq!(
            apus_to_plain(&ApusValue::Stream {
                id: 1,
                content_type: "application/octet-stream".into(),
                length: -1,
            }),
            PlainValue::Null
        );
        assert_eq!(
            apus_to_plain(&ApusValue::SubFlow {
                id: "sub-1".into(),
                input_schema: Box::new(ApusValue::Null),
                output_schema: Box::new(ApusValue::Null),
            }),
            PlainValue::Null
        );
    }
}
