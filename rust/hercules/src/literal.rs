//! Resolves an `ActionLiteralValue`'s inline `${signature}` references,
//! mirroring `ts/src/internal/literal.ts` (the TS SDK, the source of truth
//! for this behavior).
//!
//! A literal's `value` may contain `${signature}` placeholders inside
//! (possibly nested) string leaves. Each placeholder is looked up in the
//! literal's `references` list and substituted: a string that is *exactly*
//! one placeholder adopts the referenced value verbatim (preserving its
//! type, including a sub flow reference); a string with a placeholder mixed
//! into other text has the reference interpolated as text instead. Unknown
//! signatures are left untouched.

use std::collections::HashMap;

use tucana::aquila::{action_node_value, ActionLiteralValue, ActionNodeSubFlowValue, ActionNodeValue};
use tucana::shared::{value, Value};

use crate::error::{HerculesError, Result};
use crate::types::PlainValue;
use crate::value::to_allowed_value;

/// A resolved parameter/reference value: either a plain JSON value or a
/// reference to a sub flow that the caller can run via
/// [`crate::Connected::execute_sub_flow`].
///
/// Unlike TS, where a resolved value can freely be a callable embedded
/// anywhere (even nested inside an object or array), Rust's [`PlainValue`]
/// (`serde_json::Value`) has no way to carry a sub flow reference inline.
/// A sub flow reference can therefore only be adopted at the top level of a
/// literal (its sole `${signature}` placeholder) — see [`resolve_value`] for
/// what happens if one turns up nested inside a struct or list instead.
#[derive(Debug, Clone)]
pub(crate) enum ResolvedValue {
    Literal(PlainValue),
    SubFlow(ActionNodeSubFlowValue),
}

type References = HashMap<String, Option<ResolvedValue>>;

/// Resolves a single parameter node into a concrete value. Literal values
/// have their inline `${signature}` references substituted; sub flow
/// references pass through unchanged.
pub(crate) fn resolve_node_value(node: Option<ActionNodeValue>) -> Result<Option<ResolvedValue>> {
    let Some(node) = node else {
        return Ok(None);
    };
    match node.value {
        Some(action_node_value::Value::LiteralValue(literal)) => resolve_literal(literal).map(Some),
        Some(action_node_value::Value::SubFlow(sub_flow)) => Ok(Some(ResolvedValue::SubFlow(sub_flow))),
        None => Ok(None),
    }
}

/// Resolves an [`ActionLiteralValue`] into a concrete value, substituting
/// every inline reference it declares.
pub(crate) fn resolve_literal(literal: ActionLiteralValue) -> Result<ResolvedValue> {
    let mut references = References::with_capacity(literal.references.len());
    for reference in literal.references {
        let resolved = resolve_node_value(reference.value)?;
        references.insert(reference.signature, resolved);
    }
    match literal.value {
        Some(value) => resolve_value(value, &references),
        None => Ok(ResolvedValue::Literal(PlainValue::Null)),
    }
}

fn resolve_value(value: Value, references: &References) -> Result<ResolvedValue> {
    match value.kind {
        Some(value::Kind::StringValue(raw)) => resolve_string(&raw, references),
        Some(value::Kind::StructValue(s)) => {
            let mut result = serde_json::Map::with_capacity(s.fields.len());
            for (key, field) in s.fields {
                let resolved = resolve_value(field, references)?;
                result.insert(key.clone(), expect_plain(resolved, &key)?);
            }
            Ok(ResolvedValue::Literal(PlainValue::Object(result)))
        }
        Some(value::Kind::ListValue(l)) => {
            let mut result = Vec::with_capacity(l.values.len());
            for (index, element) in l.values.into_iter().enumerate() {
                let resolved = resolve_value(element, references)?;
                result.push(expect_plain(resolved, &index.to_string())?);
            }
            Ok(ResolvedValue::Literal(PlainValue::Array(result)))
        }
        // Numbers, booleans and null cannot carry placeholders.
        other => Ok(ResolvedValue::Literal(to_allowed_value(Value { kind: other }))),
    }
}

/// Unwraps a nested [`ResolvedValue`] into a [`PlainValue`] for embedding
/// inside a struct/list literal. Unlike a top-level literal (see
/// [`resolve_string`]'s sole-placeholder case), there is no way to embed a
/// sub flow reference inside a plain JSON value, so this errors loudly
/// instead of silently dropping or mis-stringifying it.
fn expect_plain(value: ResolvedValue, context: &str) -> Result<PlainValue> {
    match value {
        ResolvedValue::Literal(v) => Ok(v),
        ResolvedValue::SubFlow(_) => Err(HerculesError::Other(format!(
            "inline reference at {context:?} resolves to a sub flow, but only a literal value that is exactly a single `${{signature}}` placeholder may resolve to a sub flow"
        ))),
    }
}

/// Matches a string that consists of exactly one `${signature}` placeholder.
fn sole_reference(raw: &str) -> Option<&str> {
    let inner = raw.strip_prefix("${")?.strip_suffix('}')?;
    if inner.contains('}') {
        return None;
    }
    Some(inner)
}

fn resolve_string(raw: &str, references: &References) -> Result<ResolvedValue> {
    if let Some(signature) = sole_reference(raw) {
        return Ok(match references.get(signature) {
            // Adopt the referenced value verbatim so its type (number, object, sub flow, …) is preserved.
            Some(resolved) => resolved.clone().unwrap_or(ResolvedValue::Literal(PlainValue::Null)),
            None => ResolvedValue::Literal(PlainValue::String(raw.to_string())),
        });
    }
    let mut result = String::with_capacity(raw.len());
    let mut rest = raw;
    while let Some(start) = rest.find("${") {
        result.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let Some(end) = after.find('}') else {
            result.push_str(&rest[start..]);
            rest = "";
            break;
        };
        let signature = &after[..end];
        match references.get(signature) {
            Some(resolved) => result.push_str(&stringify_reference(signature, resolved.as_ref())?),
            // Unknown signatures are left untouched.
            None => result.push_str(&rest[start..start + 2 + end + 1]),
        }
        rest = &after[end + 1..];
    }
    result.push_str(rest);
    Ok(ResolvedValue::Literal(PlainValue::String(result)))
}

fn stringify_reference(signature: &str, value: Option<&ResolvedValue>) -> Result<String> {
    match value {
        None => Ok(String::new()),
        Some(ResolvedValue::Literal(PlainValue::Null)) => Ok(String::new()),
        Some(ResolvedValue::Literal(PlainValue::String(s))) => Ok(s.clone()),
        Some(ResolvedValue::Literal(other)) => Ok(other.to_string()),
        // A sub flow has no textual form, so it cannot be interpolated into a string.
        Some(ResolvedValue::SubFlow(_)) => Err(HerculesError::runtime(
            "INLINE_REFERENCE_NOT_STRINGIFIABLE",
            Some(format!(
                "inline reference ${{{signature}}} resolves to a sub flow and cannot be interpolated into a string"
            )),
        )),
    }
}

#[cfg(test)]
mod tests {
    use tucana::aquila::ActionInlineReferenceValue;
    use tucana::shared::{number_value, value, NumberValue, Struct};

    use super::*;

    fn str(s: &str) -> Value {
        Value {
            kind: Some(value::Kind::StringValue(s.to_string())),
        }
    }

    fn int(n: i64) -> Value {
        Value {
            kind: Some(value::Kind::NumberValue(NumberValue {
                number: Some(number_value::Number::Integer(n)),
            })),
        }
    }

    fn bool(b: bool) -> Value {
        Value {
            kind: Some(value::Kind::BoolValue(b)),
        }
    }

    fn list(values: Vec<Value>) -> Value {
        Value {
            kind: Some(value::Kind::ListValue(tucana::shared::ListValue { values })),
        }
    }

    fn struct_(fields: Vec<(&str, Value)>) -> Value {
        Value {
            kind: Some(value::Kind::StructValue(Struct {
                fields: fields.into_iter().map(|(k, v)| (k.to_string(), v)).collect(),
            })),
        }
    }

    fn literal(value: Option<Value>, references: Vec<ActionInlineReferenceValue>) -> ActionLiteralValue {
        ActionLiteralValue { value, references }
    }

    fn literal_ref(signature: &str, value: Value, references: Vec<ActionInlineReferenceValue>) -> ActionInlineReferenceValue {
        ActionInlineReferenceValue {
            signature: signature.to_string(),
            value: Some(ActionNodeValue {
                value: Some(action_node_value::Value::LiteralValue(literal(Some(value), references))),
            }),
        }
    }

    fn as_plain(result: ResolvedValue) -> PlainValue {
        match result {
            ResolvedValue::Literal(v) => v,
            ResolvedValue::SubFlow(_) => panic!("expected a literal, got a sub flow"),
        }
    }

    #[test]
    fn returns_a_plain_literal_untouched_when_there_are_no_references() {
        assert_eq!(as_plain(resolve_literal(literal(Some(str("hello")), vec![])).unwrap()), serde_json::json!("hello"));
        assert_eq!(as_plain(resolve_literal(literal(Some(int(42)), vec![])).unwrap()), serde_json::json!(42));
        assert_eq!(as_plain(resolve_literal(literal(None, vec![])).unwrap()), serde_json::json!(null));
    }

    #[test]
    fn adopts_the_referenced_value_verbatim_when_the_string_is_a_sole_placeholder() {
        let result = resolve_literal(literal(Some(str("${count}")), vec![literal_ref("count", int(7), vec![])])).unwrap();
        assert_eq!(as_plain(result), serde_json::json!(7));
    }

    #[test]
    fn preserves_non_string_reference_types_on_full_replacement() {
        let result = resolve_literal(literal(Some(str("${enabled}")), vec![literal_ref("enabled", bool(true), vec![])])).unwrap();
        assert_eq!(as_plain(result), serde_json::json!(true));
    }

    #[test]
    fn interpolates_references_into_surrounding_text() {
        let result = resolve_literal(literal(
            Some(str("Hello ${name}, you are ${age}")),
            vec![literal_ref("name", str("Ada"), vec![]), literal_ref("age", int(36), vec![])],
        ))
        .unwrap();
        assert_eq!(as_plain(result), serde_json::json!("Hello Ada, you are 36"));
    }

    #[test]
    fn leaves_unknown_signatures_untouched() {
        assert_eq!(
            as_plain(resolve_literal(literal(Some(str("${missing}")), vec![])).unwrap()),
            serde_json::json!("${missing}")
        );
        assert_eq!(
            as_plain(resolve_literal(literal(Some(str("a ${missing} b")), vec![])).unwrap()),
            serde_json::json!("a ${missing} b")
        );
    }

    #[test]
    fn resolves_placeholders_inside_nested_structs_and_lists() {
        let value = struct_(vec![
            ("greeting", str("Hi ${name}")),
            ("tags", list(vec![str("${primary}"), str("static")])),
        ]);
        let result = resolve_literal(literal(
            Some(value),
            vec![literal_ref("name", str("Grace"), vec![]), literal_ref("primary", int(1), vec![])],
        ))
        .unwrap();
        assert_eq!(
            as_plain(result),
            serde_json::json!({"greeting": "Hi Grace", "tags": [1, "static"]})
        );
    }

    #[test]
    fn stringifies_structured_references_during_interpolation() {
        let result = resolve_literal(literal(
            Some(str("payload=${obj}")),
            vec![literal_ref("obj", struct_(vec![("a", int(1))]), vec![])],
        ))
        .unwrap();
        assert_eq!(as_plain(result), serde_json::json!("payload={\"a\":1}"));
    }

    #[test]
    fn resolves_references_that_themselves_contain_references() {
        let nested = literal_ref("outer", str("<${inner}>"), vec![literal_ref("inner", str("deep"), vec![])]);
        let result = resolve_literal(literal(Some(str("${outer}")), vec![nested])).unwrap();
        assert_eq!(as_plain(result), serde_json::json!("<deep>"));
    }

    #[test]
    fn errors_when_a_sub_flow_reference_is_interpolated_into_a_string() {
        let sub_flow_ref = ActionInlineReferenceValue {
            signature: "run".to_string(),
            value: Some(ActionNodeValue {
                value: Some(action_node_value::Value::SubFlow(ActionNodeSubFlowValue {
                    execution_identifier: "x".into(),
                    input_schema: None,
                    output_schema: None,
                })),
            }),
        };
        let err = resolve_literal(literal(Some(str("result: ${run}")), vec![sub_flow_ref])).unwrap_err();
        assert!(matches!(err, HerculesError::Runtime { code, .. } if code == "INLINE_REFERENCE_NOT_STRINGIFIABLE"));
    }

    #[test]
    fn adopts_a_sub_flow_reference_verbatim_when_it_is_the_sole_placeholder() {
        let sub_flow_ref = ActionInlineReferenceValue {
            signature: "run".to_string(),
            value: Some(ActionNodeValue {
                value: Some(action_node_value::Value::SubFlow(ActionNodeSubFlowValue {
                    execution_identifier: "x".into(),
                    input_schema: None,
                    output_schema: None,
                })),
            }),
        };
        let result = resolve_literal(literal(Some(str("${run}")), vec![sub_flow_ref])).unwrap();
        match result {
            ResolvedValue::SubFlow(sub_flow) => assert_eq!(sub_flow.execution_identifier, "x"),
            ResolvedValue::Literal(v) => panic!("expected a sub flow, got {v:?}"),
        }
    }

    #[test]
    fn errors_when_a_sub_flow_reference_is_nested_inside_a_struct() {
        // Unlike TS, a struct/list field can't carry a sub flow reference —
        // there is no PlainValue variant for it — so this must error instead
        // of silently coercing or dropping it.
        let sub_flow_ref = ActionInlineReferenceValue {
            signature: "run".to_string(),
            value: Some(ActionNodeValue {
                value: Some(action_node_value::Value::SubFlow(ActionNodeSubFlowValue {
                    execution_identifier: "x".into(),
                    input_schema: None,
                    output_schema: None,
                })),
            }),
        };
        let value = struct_(vec![("callback", str("${run}"))]);
        let err = resolve_literal(literal(Some(value), vec![sub_flow_ref])).unwrap_err();
        assert!(matches!(err, HerculesError::Other(_)));
    }

    #[test]
    fn resolve_node_value_returns_none_for_an_absent_node() {
        assert!(resolve_node_value(None).unwrap().is_none());
    }
}
