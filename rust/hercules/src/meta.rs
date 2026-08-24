//! The metadata shapes produced by `#[hercules::...]` attribute macros, and
//! the merge rules that combine a `Function`/`Event`'s overrides with the
//! `RuntimeFunction`/`RuntimeEvent` they extend.
//!
//! Each `#[hercules::runtime_function]` / `#[hercules::function]` / ... macro
//! generates a `meta()` associated function that builds one of these shapes
//! once, at compile time — there's no runtime reflection or registry lookup
//! involved in producing it.

use crate::error::{HerculesError, Result};
use crate::types::{PlainValue, Translation, UniquenessScope};

/// One parameter of a (runtime) function. Also doubles as an *override* when
/// it appears on a [`crate::function::Function`]: a parameter with the same
/// `runtime_name` as one on the base [`crate::function::RuntimeFunction`]
/// fully replaces it rather than merging field by field.
#[derive(Debug, Clone, Default)]
pub struct ParameterMeta {
    pub runtime_name: String,
    /// The parameter name on the runtime function this refers to, if it
    /// differs from `runtime_name` (lets a public `Function` rename a
    /// parameter it re-exposes).
    pub runtime_definition_name: Option<String>,
    pub name: Vec<Translation>,
    pub description: Vec<Translation>,
    pub documentation: Vec<Translation>,
    pub default_value: Option<PlainValue>,
    pub hidden: bool,
    pub optional: bool,
}

/// One setting of a (runtime) event. See [`ParameterMeta`] for the override
/// semantics on [`crate::event::Event`].
#[derive(Debug, Clone, Default)]
pub struct EventSettingMeta {
    pub identifier: String,
    pub unique: UniquenessScope,
    pub linked_data_type_identifiers: Vec<String>,
    pub default_value: Option<PlainValue>,
    pub name: Vec<Translation>,
    pub description: Vec<Translation>,
    pub hidden: bool,
    pub optional: bool,
}

/// Fully-resolved metadata for a [`crate::function::RuntimeFunction`].
#[derive(Debug, Clone, Default)]
pub struct RuntimeFunctionMeta {
    pub identifier: String,
    pub signature: String,
    pub name: Vec<Translation>,
    pub description: Vec<Translation>,
    pub documentation: Vec<Translation>,
    pub deprecation_message: Vec<Translation>,
    pub display_message: Vec<Translation>,
    pub alias: Vec<Translation>,
    pub display_icon: Option<String>,
    pub design: Option<String>,
    pub throws_error: bool,
    /// If set, this runtime function is never published as a public
    /// [`crate::function::Function`] on its own — only via an explicit
    /// `#[hercules::function(base = ...)]` type.
    pub omit_definition: bool,
    pub parameters: Vec<ParameterMeta>,
    pub linked_data_type_identifiers: Vec<String>,
}

/// Overrides declared on a [`crate::function::Function`]; every field falls
/// back to the value on its `RuntimeFunction` base when absent.
#[derive(Debug, Clone, Default)]
pub struct FunctionMeta {
    pub identifier: Option<String>,
    pub signature: Option<String>,
    pub name: Option<Vec<Translation>>,
    pub description: Option<Vec<Translation>>,
    pub documentation: Option<Vec<Translation>>,
    pub deprecation_message: Option<Vec<Translation>>,
    pub display_message: Option<Vec<Translation>>,
    pub alias: Option<Vec<Translation>>,
    pub display_icon: Option<String>,
    pub design: Option<String>,
    pub throws_error: Option<bool>,
    pub parameters: Vec<ParameterMeta>,
}

/// A [`FunctionMeta`] merged onto its base [`RuntimeFunctionMeta`] — the
/// shape actually sent to Aquila.
#[derive(Debug, Clone)]
pub struct FunctionDef {
    pub runtime_definition_name: String,
    pub runtime_name: String,
    pub signature: String,
    pub throws_error: bool,
    pub name: Vec<Translation>,
    pub description: Vec<Translation>,
    pub documentation: Vec<Translation>,
    pub deprecation_message: Vec<Translation>,
    pub display_message: Vec<Translation>,
    pub alias: Vec<Translation>,
    pub display_icon: Option<String>,
    pub design: Option<String>,
    pub parameters: Vec<ParameterMeta>,
    pub linked_data_type_identifiers: Vec<String>,
}

/// Merges a `Function`'s overrides onto its `RuntimeFunction` base: unset
/// fields fall back to the base, and parameters are matched by
/// `runtime_name` (an override fully replaces the base parameter;
/// unmentioned base parameters pass through unchanged).
pub fn merge_function(
    base: RuntimeFunctionMeta,
    over: FunctionMeta,
    class: &'static str,
) -> Result<FunctionDef> {
    for p in &over.parameters {
        if !base
            .parameters
            .iter()
            .any(|bp| bp.runtime_name == p.runtime_name)
        {
            return Err(HerculesError::UnknownParameter {
                class,
                parameter: p.runtime_name.clone(),
            });
        }
    }
    Ok(merge_function_unchecked(base, over))
}

/// The same merge as [`merge_function`], without validating that `over`'s
/// parameters actually exist on `base`. Used to publish a
/// [`RuntimeFunction`] as its own same-named [`crate::function::Function`]
/// with an empty [`FunctionMeta`] — there are no overrides to validate, so
/// there is nothing to fail.
pub(crate) fn merge_function_unchecked(
    base: RuntimeFunctionMeta,
    over: FunctionMeta,
) -> FunctionDef {
    let mut parameters = over.parameters;
    for bp in &base.parameters {
        if !parameters.iter().any(|p| p.runtime_name == bp.runtime_name) {
            parameters.push(bp.clone());
        }
    }
    for p in &mut parameters {
        if p.runtime_definition_name.is_none() {
            p.runtime_definition_name = Some(p.runtime_name.clone());
        }
    }

    FunctionDef {
        runtime_definition_name: base.identifier.clone(),
        runtime_name: over.identifier.unwrap_or(base.identifier),
        signature: over.signature.unwrap_or(base.signature),
        throws_error: over.throws_error.unwrap_or(base.throws_error),
        name: over.name.unwrap_or(base.name),
        description: over.description.unwrap_or(base.description),
        documentation: over.documentation.unwrap_or(base.documentation),
        deprecation_message: over.deprecation_message.unwrap_or(base.deprecation_message),
        display_message: over.display_message.unwrap_or(base.display_message),
        alias: over.alias.unwrap_or(base.alias),
        display_icon: over.display_icon.or(base.display_icon),
        design: over.design.or(base.design),
        parameters,
        linked_data_type_identifiers: base.linked_data_type_identifiers,
    }
}

/// Fully-resolved metadata for a [`crate::event::RuntimeEvent`].
#[derive(Debug, Clone, Default)]
pub struct RuntimeEventMeta {
    pub identifier: String,
    pub signature: String,
    pub settings: Vec<EventSettingMeta>,
    pub editable: bool,
    pub name: Vec<Translation>,
    pub description: Vec<Translation>,
    pub documentation: Vec<Translation>,
    pub display_message: Vec<Translation>,
    pub alias: Vec<Translation>,
    pub display_icon: Option<String>,
    /// If set, this runtime event is never published as a public
    /// [`crate::event::Event`] on its own — mirrors
    /// [`RuntimeFunctionMeta::omit_definition`].
    pub omit_definition: bool,
    /// Data types linked to this event beyond what its settings already
    /// contribute (see [`crate::module_builder`]'s settings union) — e.g.
    /// the type of the value the event produces as flow input, which isn't
    /// any one setting's type.
    pub linked_data_type_identifiers: Vec<String>,
}

/// Overrides declared on a [`crate::event::Event`]; see [`FunctionMeta`].
#[derive(Debug, Clone, Default)]
pub struct EventMeta {
    pub identifier: Option<String>,
    pub signature: Option<String>,
    pub settings: Vec<EventSettingMeta>,
    pub editable: Option<bool>,
    pub name: Option<Vec<Translation>>,
    pub description: Option<Vec<Translation>>,
    pub documentation: Option<Vec<Translation>>,
    pub display_message: Option<Vec<Translation>>,
    pub alias: Option<Vec<Translation>>,
    pub display_icon: Option<String>,
}

/// An [`EventMeta`] merged onto its base [`RuntimeEventMeta`].
#[derive(Debug, Clone)]
pub struct EventDef {
    pub runtime_identifier: String,
    pub identifier: String,
    pub signature: String,
    pub settings: Vec<EventSettingMeta>,
    pub editable: bool,
    pub name: Vec<Translation>,
    pub description: Vec<Translation>,
    pub documentation: Vec<Translation>,
    pub display_message: Vec<Translation>,
    pub alias: Vec<Translation>,
    pub display_icon: Option<String>,
    pub linked_data_type_identifiers: Vec<String>,
}

/// Merges an `Event`'s overrides onto its `RuntimeEvent` base. Unlike
/// parameters, settings always come from the base (in its order); the
/// `Event` may only override individual fields per identifier (e.g. give a
/// setting a default value).
pub fn merge_event(
    base: RuntimeEventMeta,
    over: EventMeta,
    class: &'static str,
) -> Result<EventDef> {
    for s in &over.settings {
        if !base.settings.iter().any(|bs| bs.identifier == s.identifier) {
            return Err(HerculesError::UnknownSetting {
                class,
                setting: s.identifier.clone(),
            });
        }
    }
    Ok(merge_event_unchecked(base, over))
}

/// The same merge as [`merge_event`], without validating that `over`'s
/// settings actually exist on `base`. See [`merge_function_unchecked`].
pub(crate) fn merge_event_unchecked(base: RuntimeEventMeta, over: EventMeta) -> EventDef {
    let settings = base
        .settings
        .iter()
        .map(|bs| {
            over.settings
                .iter()
                .find(|s| s.identifier == bs.identifier)
                .cloned()
                .unwrap_or_else(|| bs.clone())
        })
        .collect();

    EventDef {
        runtime_identifier: base.identifier.clone(),
        identifier: over.identifier.unwrap_or(base.identifier),
        signature: over.signature.unwrap_or(base.signature),
        settings,
        editable: over.editable.unwrap_or(base.editable),
        name: over.name.unwrap_or(base.name),
        description: over.description.unwrap_or(base.description),
        documentation: over.documentation.unwrap_or(base.documentation),
        display_message: over.display_message.unwrap_or(base.display_message),
        alias: over.alias.unwrap_or(base.alias),
        display_icon: over.display_icon.or(base.display_icon),
        linked_data_type_identifiers: base.linked_data_type_identifiers,
    }
}

/// Metadata for a [`crate::data_type::DataType`]. Unlike functions/events,
/// data types have no base to extend.
#[derive(Debug, Clone, Default)]
pub struct DataTypeMeta {
    pub identifier: String,
    pub name: Vec<Translation>,
    pub display_message: Vec<Translation>,
    pub alias: Vec<Translation>,
    pub generic_keys: Vec<String>,
    /// Overrides the `schemars`-derived structural-type string entirely.
    /// Needed for shapes `schemars`/JSON Schema can't express at all —
    /// generic-conditional types (`T extends 'Basic' ? ... : ...`) or a
    /// reference to another registered type's generic instantiation
    /// (`REST_AUTH_VALUE<A>`) — where deriving from the Rust type would
    /// either fail or produce something structurally different from what
    /// Aquila expects.
    pub type_override: Option<String>,
    /// Data types this one references in its structural type but that
    /// `schemars` derivation can't discover on its own (e.g. `OBJECT` inside
    /// a hand-written [`type_override`]).
    pub linked_data_type_identifiers: Vec<String>,
}
