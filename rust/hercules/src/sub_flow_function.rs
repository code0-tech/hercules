//! Sub flow function support (port of `ts/src/internal/sub-flow-function.ts`
//! and `ts/src/manager/SubFlowFunctionManager.ts`).
//!
//! A runtime function's handler may return a [`SubFlowFunctionDefinition`]
//! instead of raw data. Hercules registers it on the connection and reports it
//! to Aquila as a `shared.SubFlowFunctionResult`, so the flow can invoke it
//! later like any other sub flow. Because nothing in the module definition
//! describes a function created at runtime, the returned definition has to
//! carry its own name, description and I/O schema.

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

use async_trait::async_trait;
use schemars::{JsonSchema, SchemaGenerator, generate::SchemaSettings};
use tokio::time::{Duration, Instant};
use tucana::shared::value::Kind;
use tucana::shared::{Struct, SubFlowFunction as WireSubFlowFunction, SubFlowFunctionResult};

use crate::connected::ConnectedInner;
use crate::error::{HerculesError, Result};
use crate::types::{FunctionContext, PlainValue};
use crate::value::construct_value;

/// How long a returned sub flow function stays in memory and invocable: 30 minutes.
pub const SUB_FLOW_FUNCTION_TTL: Duration = Duration::from_secs(30 * 60);

/// The behavior of a sub flow function returned at execution time. Invoked
/// with every parameter of the request passed through positionally (a sub flow
/// function has no declaration naming its parameters).
///
/// A plain `Fn(&FunctionContext, Vec<PlainValue>) -> Result<PlainValue>`
/// closure implements this automatically, so the common case — returning a
/// function that closes over values computed in the outer `run` — needs no
/// extra type. Implement the trait by hand for a handler that has to `.await`.
#[async_trait]
pub trait SubFlowFunctionHandler: Send + Sync + 'static {
    async fn run(
        &self,
        context: &FunctionContext,
        parameters: Vec<PlainValue>,
    ) -> Result<PlainValue>;
}

#[async_trait]
impl<F> SubFlowFunctionHandler for F
where
    F: Fn(&FunctionContext, Vec<PlainValue>) -> Result<PlainValue> + Send + Sync + 'static,
{
    async fn run(
        &self,
        context: &FunctionContext,
        parameters: Vec<PlainValue>,
    ) -> Result<PlainValue> {
        (self)(context, parameters)
    }
}

/// Describes a sub flow function's input or output. A plain JSON schema object
/// (e.g. produced from a Rust type's [`JsonSchema`] impl via
/// [`SubFlowFunctionDefinition::input_schema`]) is converted to the wire
/// `Struct` while the result is sent; a ready-made [`Struct`] (e.g. one taken
/// from a `SubFlow`) is passed through unchanged.
#[derive(Clone, Debug)]
pub enum SubFlowFunctionSchema {
    Json(PlainValue),
    Struct(Struct),
}

impl From<Struct> for SubFlowFunctionSchema {
    fn from(value: Struct) -> Self {
        Self::Struct(value)
    }
}

impl From<PlainValue> for SubFlowFunctionSchema {
    fn from(value: PlainValue) -> Self {
        Self::Json(value)
    }
}

/// A sub flow function returned from a runtime function's handler in place of
/// raw data. See the module docs.
#[derive(Clone)]
pub struct SubFlowFunctionDefinition {
    pub name: String,
    pub description: String,
    pub input_schema: Option<SubFlowFunctionSchema>,
    pub output_schema: Option<SubFlowFunctionSchema>,
    pub(crate) handler: Arc<dyn SubFlowFunctionHandler>,
}

impl SubFlowFunctionDefinition {
    /// A new definition with the given `name` and behavior. Name a non-empty
    /// string: a function returned without one is reported to Aquila as a
    /// `SUB_FLOW_FUNCTION_MISSING_NAME` error rather than registered.
    pub fn new(name: impl Into<String>, handler: impl SubFlowFunctionHandler) -> Self {
        Self {
            name: name.into(),
            description: String::new(),
            input_schema: None,
            output_schema: None,
            handler: Arc::new(handler),
        }
    }

    pub fn description(mut self, description: impl Into<String>) -> Self {
        self.description = description.into();
        self
    }

    /// Declares the input the function accepts, from a Rust type's
    /// [`JsonSchema`] impl under the deserialize (validation) contract — what
    /// the function reads.
    pub fn input_schema<T: JsonSchema>(mut self) -> Self {
        self.input_schema = Some(SubFlowFunctionSchema::Json(json_schema_for::<T>(false)));
        self
    }

    /// Declares the output the function produces, from a Rust type's
    /// [`JsonSchema`] impl under the serialize contract — what the function
    /// writes.
    pub fn output_schema<T: JsonSchema>(mut self) -> Self {
        self.output_schema = Some(SubFlowFunctionSchema::Json(json_schema_for::<T>(true)));
        self
    }

    /// Sets the input schema from a ready-made [`Struct`] or plain JSON value,
    /// for callers that already have one (e.g. taken from a `SubFlow`).
    pub fn input(mut self, schema: impl Into<SubFlowFunctionSchema>) -> Self {
        self.input_schema = Some(schema.into());
        self
    }

    /// Sets the output schema from a ready-made [`Struct`] or plain JSON value.
    pub fn output(mut self, schema: impl Into<SubFlowFunctionSchema>) -> Self {
        self.output_schema = Some(schema.into());
        self
    }
}

/// Converts a Rust type's JSON schema under the contract matching the side it
/// describes: the deserialize contract for an input schema (what the function
/// reads) and the serialize contract for an output schema (what it writes).
fn json_schema_for<T: JsonSchema>(serialize: bool) -> PlainValue {
    let settings = if serialize {
        SchemaSettings::default().for_serialize()
    } else {
        SchemaSettings::default().for_deserialize()
    };
    SchemaGenerator::new(settings)
        .into_root_schema_for::<T>()
        .to_value()
}

/// Converts a declared schema into the `shared.Struct` the protobuf field
/// expects, or `None` when there is nothing structured to send.
fn to_struct(schema: Option<&SubFlowFunctionSchema>) -> Option<Struct> {
    match schema {
        Some(SubFlowFunctionSchema::Struct(s)) => Some(s.clone()),
        Some(SubFlowFunctionSchema::Json(json)) => struct_from_json(json),
        None => struct_from_json(&serde_json::json!({})),
    }
}

fn struct_from_json(json: &PlainValue) -> Option<Struct> {
    match construct_value(json).kind {
        Some(Kind::StructValue(s)) => Some(s),
        _ => None,
    }
}

/// Registers the sub flow function on the connection and builds the
/// `shared.SubFlowFunctionResult` that reports it back to Aquila. The
/// identifier in the result is the one Aquila sends back on an execution
/// request when the flow invokes the function.
pub(crate) fn build_sub_flow_function_result(
    inner: &Arc<ConnectedInner>,
    definition: SubFlowFunctionDefinition,
) -> Result<SubFlowFunctionResult> {
    if definition.name.is_empty() {
        return Err(HerculesError::runtime(
            "SUB_FLOW_FUNCTION_MISSING_NAME",
            Some("A sub flow function returned from a run block must declare a name".to_string()),
        ));
    }
    let name = definition.name.clone();
    let description = definition.description.clone();
    let input_schema = to_struct(definition.input_schema.as_ref());
    let output_schema = to_struct(definition.output_schema.as_ref());
    let function_identifier = inner.register_sub_flow_function(definition);
    Ok(SubFlowFunctionResult {
        function: Some(WireSubFlowFunction {
            function_identifier,
            definition_source: Some("action".to_string()),
        }),
        input_schema,
        output_schema,
        name,
        description,
    })
}

/// Sub flow functions a runtime function returned at execution time, keyed by
/// the identifier reported to Aquila.
///
/// Each entry has a maximum lifetime of [`SUB_FLOW_FUNCTION_TTL`], counted from
/// when it was registered and never extended by an invocation, so a flow that
/// holds a function forever cannot grow the registry without bound. Expired
/// entries are dropped by a sweep scheduled for the next expiry (see
/// [`ConnectedInner::schedule_sub_flow_sweep`]), and on any read or write, so
/// an expired function is never invoked even if the sweep could not run.
#[derive(Default)]
pub(crate) struct SubFlowFunctionState {
    functions: HashMap<String, SubFlowFunctionDefinition>,
    /// Expiry per key, in expiry order — which is insertion order, since the
    /// TTL is fixed.
    expiries: VecDeque<(String, Instant)>,
    /// Whether a sweep task is already running, so a burst of registrations
    /// schedules at most one.
    sweeper_running: bool,
}

impl SubFlowFunctionState {
    pub(crate) fn insert(&mut self, key: String, value: SubFlowFunctionDefinition, expires_at: Instant) {
        // Drop any prior expiry for the key so a replaced key moves to the back
        // and the queue stays ordered by expiry.
        self.expiries.retain(|(existing, _)| existing != &key);
        self.functions.insert(key.clone(), value);
        self.expiries.push_back((key, expires_at));
    }

    pub(crate) fn get(&self, key: &str) -> Option<&SubFlowFunctionDefinition> {
        self.functions.get(key)
    }

    #[cfg(test)]
    pub(crate) fn len(&self) -> usize {
        self.functions.len()
    }

    /// Drops every entry whose lifetime has passed.
    pub(crate) fn prune(&mut self, now: Instant) {
        while let Some((key, expires_at)) = self.expiries.front() {
            // Ordered by expiry, so the first entry still alive ends the sweep.
            if *expires_at > now {
                break;
            }
            let key = key.clone();
            self.expiries.pop_front();
            self.functions.remove(&key);
        }
    }

    /// The earliest expiry still pending, if any.
    pub(crate) fn next_expiry(&self) -> Option<Instant> {
        self.expiries.front().map(|(_, expires_at)| *expires_at)
    }

    pub(crate) fn set_sweeper_running(&mut self, running: bool) {
        self.sweeper_running = running;
    }

    pub(crate) fn sweeper_running(&self) -> bool {
        self.sweeper_running
    }
}
