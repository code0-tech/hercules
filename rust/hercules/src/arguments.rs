use std::collections::HashMap;

use serde::de::DeserializeOwned;

use crate::error::{HerculesError, Result};
use crate::types::PlainValue;

/// Named, typed access to a function's incoming parameters.
///
/// The wire sends parameters as a name -> value map (a protobuf `Struct`),
/// so this keeps that shape rather than flattening it into a positional
/// list: `args.get::<u64>("n")?` is both self-documenting at the call site
/// and decodes directly off the incoming map, with no need to first
/// re-order values into declaration order the way an index-based API would.
#[derive(Debug, Clone, Default)]
pub struct Arguments(HashMap<String, PlainValue>);

impl Arguments {
    pub(crate) fn new(values: HashMap<String, PlainValue>) -> Self {
        Self(values)
    }

    /// Decodes the named parameter as `T`.
    ///
    /// Fails with [`HerculesError::MissingParameter`] if the caller didn't
    /// supply it at all (distinct from having explicitly supplied `null`),
    /// or [`HerculesError::Json`] if it doesn't decode as `T`.
    pub fn get<T: DeserializeOwned>(&self, name: &str) -> Result<T> {
        let value = self
            .0
            .get(name)
            .ok_or_else(|| HerculesError::MissingParameter(name.to_string()))?;
        Ok(serde_json::from_value(value.clone())?)
    }

    /// The raw, undecoded value, if the caller supplied one.
    pub fn raw(&self, name: &str) -> Option<&PlainValue> {
        self.0.get(name)
    }
}
