use hercules::JsonSchema;
use serde::{Deserialize, Serialize};

/// A data type derived from a real Rust type instead of a hand-written
/// schema DSL: `#[derive(JsonSchema)]` gives us both the structural type
/// (`"string"`) and, via `#[schemars(regex(...))]`
#[hercules::data_type(identifier = "email_address", name(en_US = "Email Address"))]
#[derive(Debug, Clone, Serialize, Deserialize, JsonSchema)]
#[serde(transparent)]
pub struct EmailAddress(#[schemars(regex(pattern = r"^[^@]+@[^@]+\.[^@]+$"))] pub String);
