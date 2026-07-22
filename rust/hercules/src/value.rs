//! Bridges [`crate::types::PlainValue`] (`serde_json::Value`) to the wire
//! `tucana::shared::Value` protobuf type, using the conversions `tucana`
//! already ships in `shared::helper::value` rather than reimplementing them.

use tucana::shared::helper::value::{from_json_value, to_json_value};
use tucana::shared::Value;

use crate::types::PlainValue;

pub fn construct_value(value: &PlainValue) -> Value {
    from_json_value(value.clone())
}

pub fn to_allowed_value(value: Value) -> PlainValue {
    to_json_value(value)
}
