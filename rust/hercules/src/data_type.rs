//! Data types are derived from a Rust type's [`schemars::JsonSchema`] impl:
//! `#[derive(JsonSchema)]` gives us the structural shape, and `schemars`'
//! own validation attributes (`#[schemars(regex(...))]`,
//! `#[schemars(range(...))]`) give us the validation rules Aquila enforces,
//! both for free.
//!
//! Aquila's `DefinitionDataType.type` field holds a small structural-type
//! string (`"string"`, `"{ id: number }"`, `"NUMBER"` for a reference to
//! another registered type), not a JSON Schema document, so [`type_string`]
//! renders the generated JSON Schema down into that syntax.

use std::collections::HashMap;
use std::sync::{OnceLock, RwLock};

use schemars::{JsonSchema, Schema, SchemaGenerator};
use serde_json::Value as Json;

use crate::error::{HerculesError, Result};
use crate::meta::DataTypeMeta;
use crate::sync;
use crate::types::Translation;

/// A custom data type an action contributes to the module's vocabulary.
/// Implemented by deriving `schemars::JsonSchema` and attaching
/// `#[hercules_sdk::data_type(identifier = "...")]`, which generates `meta()`.
pub trait DataType: JsonSchema + Send + Sync + 'static {
    fn meta() -> DataTypeMeta;
}

#[derive(Debug, Clone, PartialEq)]
pub enum DataTypeRule {
    Regex(String),
    NumberRange { from: i64, to: i64 },
}

/// Fully-resolved data type, ready to be sent to Aquila.
#[derive(Debug, Clone)]
pub struct DataTypeDef {
    pub identifier: String,
    pub name: Vec<Translation>,
    pub display_message: Vec<Translation>,
    pub alias: Vec<Translation>,
    pub generic_keys: Vec<String>,
    pub r#type: String,
    pub rules: Vec<DataTypeRule>,
    pub linked_data_type_identifiers: Vec<String>,
}

/// Maps a `schemars` schema name (`T::schema_name()`) to the hercules
/// identifier it was registered under, so `$ref`s between data types in the
/// same action resolve to their public identifier instead of their Rust type
/// name. Populated by [`resolve`] each time `Action::register_data_type` runs.
fn registry() -> &'static RwLock<HashMap<String, String>> {
    static REGISTRY: OnceLock<RwLock<HashMap<String, String>>> = OnceLock::new();
    REGISTRY.get_or_init(Default::default)
}

/// Builds the [`DataTypeDef`] for `T`, registering it so later data types
/// that embed `T` as a field render a reference to `meta.identifier` instead
/// of expanding its structure inline.
pub fn resolve<T: DataType>(meta: DataTypeMeta) -> Result<DataTypeDef> {
    sync::write(registry()).insert(T::schema_name().into_owned(), meta.identifier.clone());

    let schema = SchemaGenerator::default().into_root_schema_for::<T>();
    let defs = schema
        .get("$defs")
        .and_then(Json::as_object)
        .cloned()
        .unwrap_or_default();

    let r#type = match &meta.type_override {
        Some(type_override) => type_override.clone(),
        None => type_string(&schema, &defs, &meta.identifier, true)?,
    };

    Ok(DataTypeDef {
        r#type,
        rules: rules(&schema),
        identifier: meta.identifier,
        name: meta.name,
        display_message: meta.display_message,
        alias: meta.alias,
        generic_keys: meta.generic_keys,
        linked_data_type_identifiers: meta.linked_data_type_identifiers,
    })
}

fn rules(schema: &Schema) -> Vec<DataTypeRule> {
    let mut rules = Vec::new();
    if let Some(pattern) = schema.get("pattern").and_then(Json::as_str) {
        rules.push(DataTypeRule::Regex(pattern.to_string()));
    }
    if let (Some(from), Some(to)) = (
        schema.get("minimum").and_then(json_as_i64),
        schema.get("maximum").and_then(json_as_i64),
    ) {
        rules.push(DataTypeRule::NumberRange { from, to });
    }
    rules
}

fn json_as_i64(v: &Json) -> Option<i64> {
    v.as_i64().or_else(|| v.as_f64().map(|f| f as i64))
}

/// Renders a JSON Schema value as Aquila's structural-type string. `root` is
/// true only for the schema's own top level, so a self-referential `$ref`
/// there still expands its real structure once instead of immediately
/// collapsing to its own identifier.
fn type_string(
    schema: &Schema,
    defs: &serde_json::Map<String, Json>,
    identifier: &str,
    root: bool,
) -> Result<String> {
    if let Some(reference) = schema.get("$ref").and_then(Json::as_str) {
        let name = reference.rsplit('/').next().unwrap_or(reference);
        if !root && let Some(target) = sync::read(registry()).get(name) {
            return Ok(target.clone());
        }
        let def = defs
            .get(name)
            .ok_or_else(|| HerculesError::RecursiveDataType {
                identifier: identifier.to_string(),
            })?;
        let nested =
            Schema::try_from(def.clone()).map_err(|_| HerculesError::RecursiveDataType {
                identifier: identifier.to_string(),
            })?;
        return type_string(&nested, defs, identifier, false);
    }

    if let Some(variants) = schema
        .get("anyOf")
        .or_else(|| schema.get("oneOf"))
        .and_then(Json::as_array)
    {
        // Keep the variants in the order `schemars` generated them rather
        // than sorting: the value variant(s) come before `null`, so this
        // renders as `string | null` rather than `null | string`.
        let mut parts = Vec::with_capacity(variants.len());
        for variant in variants {
            let variant = Schema::try_from(variant.clone()).unwrap_or_default();
            parts.push(type_string(&variant, defs, identifier, false)?);
        }
        return Ok(parts.join(" | "));
    }

    // `Option<T>` fields render as a JSON Schema type *array*
    // (`"type": ["string", "null"]`) rather than `anyOf`.
    if let Some(types) = schema.get("type").and_then(Json::as_array) {
        let parts: Vec<&str> = types
            .iter()
            .filter_map(Json::as_str)
            .map(primitive_name)
            .collect();
        return Ok(parts.join(" | "));
    }

    let ty = schema.get("type").and_then(Json::as_str).unwrap_or("");
    match ty {
        "string" | "integer" | "number" | "boolean" | "null" => Ok(primitive_name(ty).to_string()),
        "array" => {
            let items = schema
                .get("items")
                .and_then(|v| Schema::try_from(v.clone()).ok())
                .unwrap_or_default();
            Ok(format!(
                "{}[]",
                type_string(&items, defs, identifier, false)?
            ))
        }
        "object" => {
            let Some(properties) = schema.get("properties").and_then(Json::as_object) else {
                // No fixed field set: either an open map (`additionalProperties`
                // set, e.g. a `HashMap<String, T>`) or a genuinely empty struct.
                return match schema
                    .get("additionalProperties")
                    .and_then(|v| Schema::try_from(v.clone()).ok())
                {
                    Some(value_schema) => Ok(format!(
                        "Record<string, {}>",
                        type_string(&value_schema, defs, identifier, false)?
                    )),
                    None => Ok("{}".into()),
                };
            };
            if properties.is_empty() {
                return Ok("{}".into());
            }
            let required: Vec<&str> = schema
                .get("required")
                .and_then(Json::as_array)
                .into_iter()
                .flatten()
                .filter_map(Json::as_str)
                .collect();

            // `properties` preserves the struct's field declaration order
            // (the `preserve_order` feature enabled on `serde_json`), so
            // fields render in the same order they're declared in the struct.
            let mut fields = Vec::with_capacity(properties.len());
            for (key, value) in properties {
                let field_schema = Schema::try_from(value.clone()).unwrap_or_default();
                let field_type = type_string(&field_schema, defs, identifier, false)?;
                fields.push(if required.contains(&key.as_str()) {
                    format!("{key}: {field_type}")
                } else {
                    format!("{key}?: {field_type} | undefined")
                });
            }
            Ok(format!("{{ {}; }}", fields.join("; ")))
        }
        _ => Ok("unknown".into()),
    }
}

/// Renders a JSON Schema primitive `type` keyword in Aquila's type-string syntax.
fn primitive_name(ty: &str) -> &'static str {
    match ty {
        "string" => "string",
        "integer" | "number" => "number",
        "boolean" => "boolean",
        "null" => "null",
        _ => "unknown",
    }
}

#[cfg(test)]
mod tests {
    use schemars::JsonSchema;
    use serde::{Deserialize, Serialize};

    use super::*;

    #[derive(Serialize, Deserialize, JsonSchema)]
    struct Many {
        zebra: String,
        apple: f64,
        mango: bool,
        nick: Option<String>,
    }

    #[derive(Serialize, Deserialize, JsonSchema)]
    struct Empty {}

    fn root_type_string<T: JsonSchema>() -> String {
        let schema = SchemaGenerator::default().into_root_schema_for::<T>();
        let defs = schema
            .get("$defs")
            .and_then(Json::as_object)
            .cloned()
            .unwrap_or_default();
        type_string(&schema, &defs, "test", true).unwrap()
    }

    // Pins the exact rendered syntax for each schema shape, so a future
    // change to `type_string` can't silently drift the wire format Aquila
    // receives.
    #[test]
    fn object_field_order_and_optional_markers() {
        assert_eq!(
            root_type_string::<Many>(),
            "{ zebra: string; apple: number; mango: boolean; nick?: string | null | undefined; }"
        );
    }

    #[test]
    fn empty_object_renders_as_empty_braces() {
        assert_eq!(root_type_string::<Empty>(), "{}");
    }

    #[test]
    fn open_map_renders_as_record() {
        assert_eq!(
            root_type_string::<std::collections::HashMap<String, i64>>(),
            "Record<string, number>"
        );
    }

    #[test]
    fn array_renders_with_bracket_suffix() {
        assert_eq!(root_type_string::<Vec<String>>(), "string[]");
    }

    #[test]
    fn nullable_root_renders_as_union_with_null() {
        assert_eq!(root_type_string::<Option<String>>(), "string | null");
    }
}
