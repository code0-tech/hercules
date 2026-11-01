//! Apus v1 data-plane transport (feature `apus`): a direct action<->Taurus
//! connection that replaces hercules's own gRPC data plane (function calls,
//! flow executions, sub-flows) while Aquila's gRPC control plane
//! (registration, per-project configuration, flows) stays exactly as today.
//!
//! See `apus/README.md` and `apus/protocol/SPEC-v1.md` in the sibling `apus`
//! repository for the protocol, and `apus/rust/apus-client` for the client
//! this module adapts. Entry point: [`connect_apus`].
//!
//! # Boundary with `apus-client`
//!
//! `apus_client::control::ControlPlane` fully re-implements Aquila's gRPC
//! control plane (logon, module, per-project configuration, flow updates,
//! *and* a gRPC fallback for calls Taurus still routes the old way). So on
//! this transport hercules's own `src/connection.rs` (gRPC) is not used at
//! all — `apus-client` owns both planes; hercules keeps ownership of
//! function/module registration (`Action::build_module`), the handler
//! dispatch contract (`RuntimeFunctionHandler`), and the public API shape
//! ([`Connected`](crate::connected::Connected)).
//!
//! # How a call is dispatched
//!
//! [`handler::ApusHandler`] implements `apus_client::CallHandler` and is
//! shared, unmodified, by both `ApusClient` (direct `CALL`s) and
//! `ControlPlane` (the gRPC fallback): it resolves the `CALL`'s method index
//! (or, for the gRPC fallback, the registered function's runtime name) to a
//! [`crate::connected::RuntimeFunctionEntry`], zips positional arguments
//! against the function's declared parameters exactly like
//! `connected::handle_execution` does for gRPC, builds the same
//! [`crate::types::FunctionContext`] hercules already hands every handler,
//! and converts the result back with [`value`].
//!
//! # Known gaps versus the gRPC transport
//!
//! - [`crate::connected::Connected::execute_sub_flow`] (by a bare execution
//!   id) is not supported here: Apus sub-flows are connection-bound. Use the
//!   handle on [`ApusCall`] instead ([`FunctionContext::apus`]).
//! - [`crate::connected::Connected::metrics`] has no meaningful equivalent
//!   (no outbound request queue on this transport) and returns all-zero,
//!   best-effort counters.
//! - A function a handler *returns* (`RuntimeFunctionReturn::SubFlowFunction`)
//!   still round-trips on the wire (`ApusValue::Function`, reusing the same
//!   TTL-bounded registry as gRPC), but if Taurus later tries to invoke it
//!   back, addressing it requires a function identifier outside the static,
//!   HELLO-negotiated method table `apus-client`'s current gRPC fallback
//!   (`control::answer`) resolves against — re-invocation of an
//!   action-returned function is therefore a gap in `apus-client` itself,
//!   not something this adapter can paper over.

pub mod handler;
pub mod transport;
mod value;

pub(crate) use transport::ApusBacking;
pub use transport::{ApusSettings, connect_apus};
pub use value::{apus_to_plain, plain_to_apus};

use std::collections::HashMap;
use std::sync::Arc;

use apus_client::{ApusValue, CallContext};

use crate::error::{HerculesError, Result};
use crate::types::PlainValue;

/// The Apus-specific part of a call's [`crate::types::FunctionContext`]: the
/// connection-bound handle needed to invoke a sub-flow parameter, and the
/// sub-flow parameters themselves (by `runtime_name`, mirroring
/// [`crate::types::FunctionContext::sub_flow_parameters`] but carrying the
/// real handle `apus_client` needs rather than just an id string).
///
/// Cheap to clone (an `Arc` underneath), consistent with
/// [`crate::connected::Connected`].
#[derive(Clone)]
pub struct ApusCall {
    pub(crate) ctx: Arc<CallContext>,
    sub_flows: HashMap<String, ApusValue>,
}

impl std::fmt::Debug for ApusCall {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ApusCall")
            .field("execution_id", &self.ctx.execution_id)
            .field("project_id", &self.ctx.project_id)
            .field("sub_flow_parameters", &self.sub_flows.keys().collect::<Vec<_>>())
            .finish_non_exhaustive()
    }
}

impl ApusCall {
    pub(crate) fn new(ctx: Arc<CallContext>, sub_flows: HashMap<String, ApusValue>) -> Self {
        Self { ctx, sub_flows }
    }

    pub fn execution_id(&self) -> &str {
        &self.ctx.execution_id
    }

    pub fn project_id(&self) -> i64 {
        self.ctx.project_id
    }

    /// Invokes a sub-flow parameter by its `runtime_name` (the same name
    /// [`crate::types::FunctionContext::sub_flow_parameters`] keys by) with
    /// positional `args`, on the connection this call arrived on. May be
    /// called any number of times while the call is outstanding.
    ///
    /// Errors if `name` did not resolve to a sub-flow reference for this
    /// call (e.g. it was a literal, or absent).
    pub async fn invoke_sub_flow(&self, name: &str, args: Vec<PlainValue>) -> Result<PlainValue> {
        let handle = self
            .sub_flows
            .get(name)
            .ok_or_else(|| HerculesError::Other(format!("{name:?} is not a sub-flow parameter of this call")))?;
        let apus_args = args.iter().map(plain_to_apus).collect();
        self.ctx
            .sub_flow(handle, apus_args)
            .await
            .map(|v| apus_to_plain(&v))
            .map_err(HerculesError::Apus)
    }

    /// Returns `bytes` as a stream value (e.g. a file), sent as the data
    /// follows the frame that carries it, with flow control — an escape
    /// hatch for callers that need to produce a raw `ApusValue::Stream`
    /// result; [`crate::function::RuntimeFunctionReturn`] can only carry a
    /// [`PlainValue`], which has no such slot.
    pub fn stream(&self, content_type: &str, bytes: Vec<u8>) -> ApusValue {
        self.ctx.stream(content_type, bytes)
    }

    /// The underlying `apus_client::CallContext`, for callers that need
    /// lower-level access this wrapper does not expose.
    pub fn raw(&self) -> &CallContext {
        &self.ctx
    }
}
