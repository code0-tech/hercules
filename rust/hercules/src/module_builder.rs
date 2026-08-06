//! Assembles the registries on an [`crate::Action`] into the wire
//! `tucana::shared::Module` sent as the `ActionLogon` payload.

use tucana::shared::{
    self, definition_data_type_rule, flow_type_setting, runtime_flow_type_setting,
    DataTypeNumberRangeRuleConfig, DataTypeRegexRuleConfig, DefinitionDataType,
    DefinitionDataTypeRule, FlowType, FlowTypeSetting, FunctionDefinition, Module,
    ModuleConfigurationDefinition, ParameterDefinition, RuntimeFlowType, RuntimeFlowTypeSetting,
    RuntimeFunctionDefinition, RuntimeParameterDefinition,
};

use crate::data_type::{DataTypeDef, DataTypeRule};
use crate::meta::{
    EventDef, EventSettingMeta, FunctionDef, ParameterMeta, RuntimeEventMeta, RuntimeFunctionMeta,
};
use crate::types::{ConfigurationDefinition, Translation, UniquenessScope};
use crate::value::construct_value;

pub struct ModuleBuildData<'a> {
    pub identifier: &'a str,
    pub version: &'a str,
    pub author: &'a str,
    pub icon: &'a str,
    pub documentation: &'a str,
    pub name: &'a [Translation],
    pub configuration_definitions: &'a [ConfigurationDefinition],
    pub data_types: Vec<&'a DataTypeDef>,
    pub events: Vec<&'a EventDef>,
    pub runtime_events: Vec<&'a RuntimeEventMeta>,
    pub functions: Vec<&'a FunctionDef>,
    pub runtime_functions: Vec<&'a RuntimeFunctionMeta>,
}

fn translations(ts: &[Translation]) -> Vec<shared::Translation> {
    ts.iter()
        .map(|t| shared::Translation {
            code: t.code.clone(),
            content: t.content.clone(),
        })
        .collect()
}

fn scope_to_flow_type_setting(scope: UniquenessScope) -> flow_type_setting::UniquenessScope {
    match scope {
        UniquenessScope::None => flow_type_setting::UniquenessScope::None,
        UniquenessScope::Project => flow_type_setting::UniquenessScope::Project,
    }
}

fn scope_to_runtime_flow_type_setting(
    scope: UniquenessScope,
) -> runtime_flow_type_setting::UniquenessScope {
    match scope {
        UniquenessScope::None => runtime_flow_type_setting::UniquenessScope::None,
        UniquenessScope::Project => runtime_flow_type_setting::UniquenessScope::Project,
    }
}

fn parameter_definition(p: &ParameterMeta) -> ParameterDefinition {
    ParameterDefinition {
        runtime_name: p.runtime_name.clone(),
        runtime_definition_name: p
            .runtime_definition_name
            .clone()
            .unwrap_or_else(|| p.runtime_name.clone()),
        name: translations(&p.name),
        description: translations(&p.description),
        documentation: translations(&p.documentation),
        hidden: Some(p.hidden),
        optional: Some(p.optional),
        default_value: p.default_value.as_ref().map(construct_value),
    }
}

fn runtime_parameter_definition(p: &ParameterMeta) -> RuntimeParameterDefinition {
    RuntimeParameterDefinition {
        runtime_name: p.runtime_name.clone(),
        name: translations(&p.name),
        description: translations(&p.description),
        documentation: translations(&p.documentation),
        hidden: Some(p.hidden),
        optional: Some(p.optional),
        default_value: p.default_value.as_ref().map(construct_value),
    }
}

fn flow_type_setting(s: &EventSettingMeta) -> FlowTypeSetting {
    FlowTypeSetting {
        identifier: s.identifier.clone(),
        unique: scope_to_flow_type_setting(s.unique) as i32,
        default_value: s.default_value.as_ref().map(construct_value),
        name: translations(&s.name),
        description: translations(&s.description),
        optional: Some(s.optional),
        hidden: Some(s.hidden),
    }
}

/// The union of every setting's own linked data types, plus any explicitly
/// declared on the event itself (e.g. the type of the value the event
/// produces as flow input, which isn't any one setting's type).
fn event_linked_data_type_identifiers(
    settings: &[EventSettingMeta],
    explicit: &[String],
) -> Vec<String> {
    let mut linked = Vec::new();
    for setting in settings {
        for identifier in &setting.linked_data_type_identifiers {
            if !linked.contains(identifier) {
                linked.push(identifier.clone());
            }
        }
    }
    for identifier in explicit {
        if !linked.contains(identifier) {
            linked.push(identifier.clone());
        }
    }
    linked
}

fn runtime_flow_type_setting(s: &EventSettingMeta) -> RuntimeFlowTypeSetting {
    RuntimeFlowTypeSetting {
        identifier: s.identifier.clone(),
        unique: scope_to_runtime_flow_type_setting(s.unique) as i32,
        default_value: s.default_value.as_ref().map(construct_value),
        name: translations(&s.name),
        description: translations(&s.description),
        optional: Some(s.optional),
        hidden: Some(s.hidden),
    }
}

fn data_type_rule(rule: &DataTypeRule) -> DefinitionDataTypeRule {
    let config = match rule {
        DataTypeRule::Regex(pattern) => {
            definition_data_type_rule::Config::Regex(DataTypeRegexRuleConfig {
                pattern: pattern.clone(),
            })
        }
        DataTypeRule::NumberRange { from, to } => {
            definition_data_type_rule::Config::NumberRange(DataTypeNumberRangeRuleConfig {
                from: *from,
                to: *to,
                steps: None,
            })
        }
    };
    DefinitionDataTypeRule {
        config: Some(config),
    }
}

const DEFAULT_DISPLAY_ICON: &str = "tabler:note";

pub fn build_module(data: ModuleBuildData) -> Module {
    Module {
        identifier: data.identifier.to_string(),
        version: data.version.to_string(),
        author: data.author.to_string(),
        icon: data.icon.to_string(),
        documentation: data.documentation.to_string(),
        name: translations(data.name),
        description: vec![],
        configurations: data
            .configuration_definitions
            .iter()
            .map(|def| ModuleConfigurationDefinition {
                identifier: def.identifier.clone(),
                name: translations(&def.name),
                description: translations(&def.description),
                r#type: def.r#type.clone(),
                linked_data_type_identifiers: def.linked_data_types.clone(),
                default_value: def.default_value.as_ref().map(construct_value),
                optional: Some(def.optional),
                hidden: Some(def.hidden),
            })
            .collect(),
        definition_data_types: data
            .data_types
            .iter()
            .map(|dt| DefinitionDataType {
                identifier: dt.identifier.clone(),
                name: translations(&dt.name),
                alias: translations(&dt.alias),
                rules: dt.rules.iter().map(data_type_rule).collect(),
                generic_keys: dt.generic_keys.clone(),
                r#type: dt.r#type.clone(),
                linked_data_type_identifiers: vec![],
                display_message: translations(&dt.display_message),
                version: data.version.to_string(),
                definition_source: "action".to_string(),
            })
            .collect(),
        flow_types: data
            .events
            .iter()
            .map(|ft| FlowType {
                identifier: ft.identifier.clone(),
                settings: ft.settings.iter().map(flow_type_setting).collect(),
                editable: ft.editable,
                name: translations(&ft.name),
                description: translations(&ft.description),
                documentation: translations(&ft.documentation),
                display_message: translations(&ft.display_message),
                alias: translations(&ft.alias),
                version: data.version.to_string(),
                display_icon: ft
                    .display_icon
                    .clone()
                    .unwrap_or_else(|| DEFAULT_DISPLAY_ICON.to_string()),
                definition_source: Some("action".to_string()),
                linked_data_type_identifiers: event_linked_data_type_identifiers(
                    &ft.settings,
                    &ft.linked_data_type_identifiers,
                ),
                signature: ft.signature.clone(),
                runtime_identifier: ft.runtime_identifier.clone(),
            })
            .collect(),
        runtime_flow_types: data
            .runtime_events
            .iter()
            .map(|rft| RuntimeFlowType {
                identifier: rft.identifier.clone(),
                runtime_settings: rft.settings.iter().map(runtime_flow_type_setting).collect(),
                editable: rft.editable,
                name: translations(&rft.name),
                description: translations(&rft.description),
                documentation: translations(&rft.documentation),
                display_message: translations(&rft.display_message),
                alias: translations(&rft.alias),
                version: data.version.to_string(),
                display_icon: rft
                    .display_icon
                    .clone()
                    .unwrap_or_else(|| DEFAULT_DISPLAY_ICON.to_string()),
                definition_source: Some("action".to_string()),
                linked_data_type_identifiers: event_linked_data_type_identifiers(
                    &rft.settings,
                    &rft.linked_data_type_identifiers,
                ),
                signature: rft.signature.clone(),
            })
            .collect(),
        function_definitions: data
            .functions
            .iter()
            .map(|f| FunctionDefinition {
                runtime_name: f.runtime_name.clone(),
                runtime_definition_name: f.runtime_definition_name.clone(),
                parameter_definitions: f.parameters.iter().map(parameter_definition).collect(),
                signature: f.signature.clone(),
                throws_error: f.throws_error,
                name: translations(&f.name),
                description: translations(&f.description),
                documentation: translations(&f.documentation),
                deprecation_message: translations(&f.deprecation_message),
                display_message: translations(&f.display_message),
                alias: translations(&f.alias),
                linked_data_type_identifiers: f.linked_data_type_identifiers.clone(),
                display_icon: f
                    .display_icon
                    .clone()
                    .unwrap_or_else(|| DEFAULT_DISPLAY_ICON.to_string()),
                version: data.version.to_string(),
                definition_source: "action".to_string(),
                design: f.design.clone(),
            })
            .collect(),
        runtime_function_definitions: data
            .runtime_functions
            .iter()
            .map(|f| RuntimeFunctionDefinition {
                runtime_name: f.identifier.clone(),
                runtime_parameter_definitions: f
                    .parameters
                    .iter()
                    .map(runtime_parameter_definition)
                    .collect(),
                signature: f.signature.clone(),
                throws_error: f.throws_error,
                name: translations(&f.name),
                description: translations(&f.description),
                documentation: translations(&f.documentation),
                deprecation_message: translations(&f.deprecation_message),
                display_message: translations(&f.display_message),
                alias: translations(&f.alias),
                linked_data_type_identifiers: f.linked_data_type_identifiers.clone(),
                version: data.version.to_string(),
                display_icon: f
                    .display_icon
                    .clone()
                    .unwrap_or_else(|| DEFAULT_DISPLAY_ICON.to_string()),
                definition_source: "action".to_string(),
                design: f.design.clone(),
            })
            .collect(),
        definitions: vec![],
        definition_source: "action".to_string(),
    }
}
