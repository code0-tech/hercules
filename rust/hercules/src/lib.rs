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
//!     async fn run(&self, _ctx: &FunctionContext, args: &Arguments) -> hercules_sdk::Result<hercules_sdk::PlainValue> {
//!         let name: String = args.get("name")?;
//!         Ok(format!("Hello, {name}!").into())
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

mod action;
mod arguments;
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
mod sync;
mod types;
mod value;

pub use action::Action;
pub use arguments::Arguments;
pub use connected::Connected;
pub use data_type::{DataType, DataTypeDef, DataTypeRule};
pub use error::{HerculesError, Result};
pub use event::{Event, RuntimeEvent};
pub use events::HerculesEvent;
pub use function::{Function, RuntimeFunction, RuntimeFunctionHandler};
pub use meta::DataTypeMeta;
pub use meta::{
    EventDef, EventMeta, EventSettingMeta, FunctionDef, FunctionMeta, ParameterMeta,
    RuntimeEventMeta, RuntimeFunctionMeta,
};
pub use registration::Registration;
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

/// Re-export of the wire types this SDK sends/receives, for callers who want
/// to inspect [`HerculesEvent`] payloads in full.
pub mod wire {
    pub use tucana::aquila::*;
    pub use tucana::shared::{Module, ModuleConfigurations};
}
