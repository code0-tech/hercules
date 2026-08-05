//! Shared value types used across the SDK: translated strings, the value a
//! function payload is expressed as, and the context handed to a running
//! function.

use std::fmt;

/// A JSON-like value flowing across the wire (event payloads, function
/// parameters/results, configuration values). This is exactly the shape the
/// tucana `Struct`/`Value` protobuf messages carry, so we reuse
/// [`serde_json::Value`] instead of inventing a parallel enum: every
/// `serde_json` combinator (`json!`, `from_value`, `Deserialize`) works on it
/// for free.
pub type PlainValue = serde_json::Value;

/// A single localized string, e.g. `Translation::new("en-US", "Add Numbers")`.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Translation {
    pub code: String,
    pub content: String,
}

impl Translation {
    pub fn new(code: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            content: content.into(),
        }
    }
}

impl fmt::Display for Translation {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.content)
    }
}

/// The per-invocation state passed to a running [`crate::function::RuntimeFunctionHandler`].
#[derive(Debug, Clone)]
pub struct FunctionContext {
    pub project_id: i64,
    pub execution_id: String,
    pub matched_config: ProjectConfiguration,
}

/// The configuration values Aquila has resolved for a single project,
/// keyed by identifier for O(1) lookup during execution.
#[derive(Debug, Clone, Default)]
pub struct ProjectConfiguration {
    pub project_id: i64,
    pub config_values: std::collections::HashMap<String, PlainValue>,
}

impl ProjectConfiguration {
    /// Looks up a configured value by its `identifier`.
    pub fn get(&self, identifier: &str) -> Option<&PlainValue> {
        self.config_values.get(identifier)
    }
}

/// Describes a module-level configuration value an action expects the user
/// to fill in (e.g. an API key), declared once in [`crate::Action::new`].
#[derive(Debug, Clone, Default)]
pub struct ConfigurationDefinition {
    pub identifier: String,
    pub r#type: String,
    pub name: Vec<Translation>,
    pub description: Vec<Translation>,
    pub hidden: bool,
    pub optional: bool,
    pub linked_data_types: Vec<String>,
    pub default_value: Option<PlainValue>,
}

impl ConfigurationDefinition {
    pub fn new(identifier: impl Into<String>, r#type: impl Into<String>) -> Self {
        Self {
            identifier: identifier.into(),
            r#type: r#type.into(),
            ..Default::default()
        }
    }

    pub fn name(mut self, name: impl IntoIterator<Item = Translation>) -> Self {
        self.name = name.into_iter().collect();
        self
    }

    pub fn description(mut self, description: impl IntoIterator<Item = Translation>) -> Self {
        self.description = description.into_iter().collect();
        self
    }

    pub fn optional(mut self, optional: bool) -> Self {
        self.optional = optional;
        self
    }

    pub fn hidden(mut self, hidden: bool) -> Self {
        self.hidden = hidden;
        self
    }

    pub fn default_value(mut self, value: impl Into<PlainValue>) -> Self {
        self.default_value = Some(value.into());
        self
    }
}

/// The uniqueness scope of an event/flow-type setting — how Aquila
/// deduplicates settings across a project.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum UniquenessScope {
    #[default]
    None,
    Project,
}

/// How Aquila distributes this action's flows/configurations across
/// multiple running instances of it. Set via [`crate::Action::scaling`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ScalingOption {
    /// Every instance of this action receives every flow/configuration.
    #[default]
    Disabled,
    /// Flows/configurations are split between the available instances of
    /// this action, so each one is only handled by a single instance.
    Split,
}

impl ScalingOption {
    pub(crate) fn into_wire(self) -> tucana::aquila::action_logon::ScalingOption {
        match self {
            Self::Disabled => tucana::aquila::action_logon::ScalingOption::Disabled,
            Self::Split => tucana::aquila::action_logon::ScalingOption::Split,
        }
    }
}
