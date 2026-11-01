//! Rust SDK for building hercules actions that connect to Aquila.
//!
//! Attaching `#[hercules_sdk::runtime_function]` (or `data_type`, `event`, ...)
//! to a type is enough to register it — see [`registration`] — so most
//! actions need nothing beyond a handful of chained setters:
//!
//! ```no_run
//! use hercules_sdk::{Action, Arguments, FunctionContext, RuntimeFunction, RuntimeFunctionHandler, async_trait};
//!
//! #[hercules_sdk::runtime_function(identifier = "greet", signature = "(name: TEXT): TEXT")]
//! struct Greet;
//!
//! #[async_trait]
//! impl RuntimeFunctionHandler for Greet {
//!     async fn run(&self, _ctx: &FunctionContext, args: &Arguments) -> hercules_sdk::Result<hercules_sdk::RuntimeFunctionReturn> {
//!         let name: String = args.get("name")?;
//!         Ok(hercules_sdk::PlainValue::from(format!("Hello, {name}!")).into())
//!     }
//! }
//!
//! # async fn run() -> hercules_sdk::Result<()> {
//! let action = Action::new("example", "0.1.0").author("me").icon("tabler:bolt");
//! let action = action.connect("token", Some("127.0.0.1:8081".into())).await?;
//! action.fire("greeted", serde_json::json!({ "name": "world" })).await?;
//! # Ok(())
//! # }
//! ```

// `apus_client::ErrorInfo` (feature `apus`) is the error of every Apus
// request; boxing it would only add an allocation per call — the same
// rationale `apus_client` itself documents for the identical lint.
#![cfg_attr(feature = "apus", allow(clippy::result_large_err))]

mod action;
#[cfg(feature = "apus")]
mod apus;
mod arguments;
mod auth;
mod connected;
mod connection;
mod data_type;
mod error;
mod event;
mod events;
mod export;
mod function;
mod literal;
mod meta;
mod module_builder;
mod registration;
mod sub_flow_function;
mod sync;
mod types;
mod value;

pub use action::{Action, DEFAULT_REQUEST_QUEUE_CAPACITY};
/// Apus v1 data-plane transport (feature `apus`): a direct action<->Taurus
/// connection that replaces this SDK's own gRPC data plane while Aquila's
/// gRPC control plane stays unchanged. See the module docs for the exact
/// boundary and known gaps versus the default gRPC transport.
#[cfg(feature = "apus")]
pub use apus::{ApusCall, ApusSettings, connect_apus};
pub use arguments::Arguments;
pub use connected::{Connected, ConnectedMetrics};
pub use data_type::{DataType, DataTypeDef, DataTypeRule};
pub use error::{HerculesError, Result};
pub use event::{Event, RuntimeEvent};
pub use events::HerculesEvent;
pub use function::{Function, RuntimeFunction, RuntimeFunctionHandler, RuntimeFunctionReturn};
pub use meta::DataTypeMeta;
pub use meta::{
    EventDef, EventMeta, EventSettingMeta, FunctionDef, FunctionMeta, ParameterMeta,
    RuntimeEventMeta, RuntimeFunctionMeta,
};
pub use registration::Registration;
pub use sub_flow_function::{
    SUB_FLOW_FUNCTION_TTL, SubFlowFunctionDefinition, SubFlowFunctionHandler, SubFlowFunctionSchema,
};
pub use types::{
    ConfigurationDefinition, FunctionContext, PlainValue, ProjectConfiguration, ScalingOption,
    Translation, UniquenessScope,
};

/// Re-exported so `#[hercules_sdk::runtime_function]`-annotated types can
/// implement `RuntimeFunctionHandler` without adding `async-trait` to their
/// own `Cargo.toml`.
pub use async_trait::async_trait;
/// Re-exported so macro-generated code can submit a [`Registration`] without
/// requiring `inventory` as a direct dependency of the consuming crate.
pub use inventory;
/// Re-exported for deriving [`DataType`] schemas: `#[derive(hercules_sdk::JsonSchema)]`.
pub use schemars::JsonSchema;
/// Re-exported so macro-generated code can build [`PlainValue`]s (`serde_json::json!`)
/// without requiring `serde_json` as a direct dependency of the consuming crate.
pub use serde_json;

pub use hercules_macros::{data_type, event, function, runtime_event, runtime_function};

/// Re-exported (feature `apus`) so callers can name Apus-specific types
/// (e.g. `apus_client::protocol::tls::TlsConnector` for [`ApusSettings::tls`])
/// without adding a separate path dependency on the sibling `apus` repo.
#[cfg(feature = "apus")]
pub use apus_client;

/// Re-export of the wire types this SDK sends/receives, for callers who want
/// to inspect [`HerculesEvent`] payloads in full.
pub mod wire {
    pub use tucana::aquila::*;
    pub use tucana::shared::{Module, ModuleConfigurations};
}
