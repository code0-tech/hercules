//! Adapts hercules's registered [`RuntimeFunctionHandler`]s to
//! `apus_client::CallHandler`, so the exact same handlers Aquila's gRPC
//! control plane dispatches to also answer Apus `CALL`s (and the gRPC
//! fallback `apus_client::control::ControlPlane` falls back to when Taurus
//! has no direct Apus connection to this action).
//!
//! Mirrors `connected::handle_execution`'s argument zipping and error
//! mapping as closely as the two wire shapes allow: gRPC's
//! `ActionExecutionRequest.parameters` is a `Vec<ActionNodeValue>`
//! (literal-or-sub-flow per position); Apus's `CALL` is a plain
//! `Vec<ApusValue>` per position, with a sub-flow parameter represented
//! in-place as `ApusValue::SubFlow` instead of a separate wire variant.

use std::collections::HashMap;
use std::sync::Arc;

use apus_client::{ApusValue, CallContext, CallHandler, CallResult, ErrorInfo, RequestResult};

use crate::arguments::Arguments;
use crate::connected::{Connected, ConnectedInner};
use crate::function::RuntimeFunctionReturn;
use crate::meta::ParameterMeta;
use crate::sub_flow_function::build_apus_function_value;
use crate::types::{FunctionContext, PlainValue, ProjectConfiguration};

use super::ApusCall;
use super::value::{apus_to_plain, plain_to_apus};

/// Wraps the same `Arc<ConnectedInner>` a gRPC-connected [`Connected`] shares
/// with its background dispatch loop, so the Apus path reuses hercules's
/// existing function registry, sub-flow-function registration/TTL sweep,
/// and per-project configuration lookup verbatim.
pub(crate) struct ApusHandler(pub(crate) Arc<ConnectedInner>);

/// The result of splitting a `CALL`'s positional arguments by kind — see
/// [`connected::resolve_parameters`](crate::connected) for the gRPC analogue.
struct SplitArgs {
    literals: HashMap<String, PlainValue>,
    sub_flow_parameters: HashMap<String, String>,
    sub_flows: HashMap<String, ApusValue>,
}

fn split_args(meta: &[ParameterMeta], args: Vec<ApusValue>) -> SplitArgs {
    let mut literals = HashMap::with_capacity(args.len());
    let mut sub_flow_parameters = HashMap::new();
    let mut sub_flows = HashMap::new();
    for (param_meta, arg) in meta.iter().zip(args) {
        if let ApusValue::SubFlow { id, .. } = &arg {
            sub_flow_parameters.insert(param_meta.runtime_name.clone(), id.clone());
            sub_flows.insert(param_meta.runtime_name.clone(), arg);
        } else {
            literals.insert(param_meta.runtime_name.clone(), apus_to_plain(&arg));
        }
    }
    SplitArgs {
        literals,
        sub_flow_parameters,
        sub_flows,
    }
}

fn error(code: &str, message: impl Into<String>) -> ErrorInfo {
    ErrorInfo::new(code, "INVALID_ARGUMENT", message)
}

impl CallHandler for ApusHandler {
    fn call(&self, method: u16, ctx: CallContext, args: Vec<ApusValue>) -> CallResult {
        let inner = self.0.clone();
        let ctx = Arc::new(ctx);

        // `method` addresses the position in the function list negotiated at
        // HELLO time — see `transport::function_names`, which is the single
        // source of truth both `Settings::functions` (Apus) and
        // `ControlSettings::functions` (the gRPC fallback) are built from.
        let identifier = match inner.apus_function_names.get(method as usize) {
            Some(identifier) => identifier.clone(),
            None => {
                return CallResult::Ready(Err(error("ACTION-UNKNOWN-METHOD", format!("unknown method index {method}"))));
            }
        };
        let Some(entry) = inner.runtime_functions.get(&identifier) else {
            return CallResult::Ready(Err(error("ACTION-UNKNOWN-FUNCTION", format!("unknown function {identifier:?}"))));
        };
        let handler = entry.handler.clone();
        let parameters = entry.meta.parameters.clone();

        CallResult::Pending(Box::pin(run(inner, handler, parameters, ctx, args)))
    }
}

async fn run(
    inner: Arc<ConnectedInner>,
    handler: Arc<dyn crate::function::RuntimeFunctionHandler>,
    parameters: Vec<ParameterMeta>,
    ctx: Arc<CallContext>,
    args: Vec<ApusValue>,
) -> RequestResult {
    let SplitArgs {
        literals,
        sub_flow_parameters,
        sub_flows,
    } = split_args(&parameters, args);

    let connected = Connected::new(inner.clone());
    let matched_config = connected.config(ctx.project_id).unwrap_or(ProjectConfiguration {
        project_id: ctx.project_id,
        config_values: HashMap::new(),
    });

    let context = FunctionContext {
        project_id: ctx.project_id,
        execution_id: ctx.execution_id.clone(),
        matched_config,
        connected,
        sub_flow_parameters,
        apus: Some(ApusCall::new(ctx, sub_flows)),
    };

    let outcome = handler.run(&context, &Arguments::new(literals)).await;
    match outcome {
        Ok(RuntimeFunctionReturn::Value(value)) => Ok(plain_to_apus(&value)),
        Ok(RuntimeFunctionReturn::SubFlowFunction(definition)) => build_apus_function_value(&inner, definition).map_err(to_error_info),
        Err(err) => Err(to_error_info(err)),
    }
}

/// Renders a handler failure as the Apus wire error, matching
/// `connected::error_result`'s code/category choice for the gRPC path.
fn to_error_info(err: crate::error::HerculesError) -> ErrorInfo {
    match err {
        crate::error::HerculesError::Runtime { code, description } => {
            ErrorInfo::new(code, "RUNTIME", description.unwrap_or_default())
        }
        crate::error::HerculesError::Apus(info) => info,
        other => ErrorInfo::new("UNKNOWN_ERROR", "RUNTIME", other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Arc;

    use async_trait::async_trait;
    use tokio::sync::{broadcast, mpsc};

    use crate::connected::RuntimeFunctionEntry;
    use crate::error::{HerculesError, Result as HResult};
    use crate::function::RuntimeFunctionHandler;
    use crate::meta::{ParameterMeta, RuntimeFunctionMeta};

    use super::*;

    /// Builds a bare `ConnectedInner` wired for the Apus transport only
    /// (gRPC fields get inert placeholders, mirroring
    /// `connected::tests::test_inner_with_runtime_functions`), with
    /// `apus_function_names` set from `functions`' declaration order —
    /// exactly what `apus::transport::connect_apus` does from the sorted
    /// registry, except tests control the order directly to pin down
    /// method-index behavior.
    fn build_inner(functions: Vec<(&str, Vec<&str>, Arc<dyn RuntimeFunctionHandler>)>) -> Arc<ConnectedInner> {
        let mut apus_function_names = Vec::new();
        let mut runtime_functions = HashMap::new();
        for (identifier, params, handler) in functions {
            apus_function_names.push(identifier.to_string());
            runtime_functions.insert(
                identifier.to_string(),
                RuntimeFunctionEntry {
                    meta: RuntimeFunctionMeta {
                        identifier: identifier.to_string(),
                        parameters: params
                            .iter()
                            .map(|name| ParameterMeta {
                                runtime_name: name.to_string(),
                                ..Default::default()
                            })
                            .collect(),
                        ..Default::default()
                    },
                    handler,
                },
            );
        }
        let (request_tx, request_rx) = mpsc::channel(1);
        drop(request_rx);
        let (events_tx, _events_rx) = broadcast::channel(16);
        Arc::new(ConnectedInner {
            identifier: "test-action".into(),
            version: "0.0.0".into(),
            runtime_functions,
            configs: Default::default(),
            flows: Default::default(),
            pending_flow_executions: Default::default(),
            pending_sub_flow_executions: Default::default(),
            next_pending_token: Default::default(),
            request_tx,
            queue_saturation_count: Default::default(),
            events_tx,
            sub_flow_functions: Default::default(),
            sub_flow_function_ttl: crate::sub_flow_function::SUB_FLOW_FUNCTION_TTL,
            apus: Default::default(),
            apus_function_names,
        })
    }

    /// Drives a `CallHandler::call` result to completion whether it answered
    /// synchronously or as a task.
    async fn drive(result: CallResult) -> RequestResult {
        match result {
            CallResult::Ready(result) => result,
            CallResult::Pending(future) => future.await,
        }
    }

    struct Echo;

    #[async_trait]
    impl RuntimeFunctionHandler for Echo {
        async fn run(&self, _ctx: &FunctionContext, args: &Arguments) -> HResult<RuntimeFunctionReturn> {
            Ok(RuntimeFunctionReturn::Value(args.raw("value").cloned().unwrap_or(PlainValue::Null)))
        }
    }

    #[tokio::test]
    async fn an_unknown_method_index_is_rejected_without_running_anything() {
        let inner = build_inner(vec![("echo", vec!["value"], Arc::new(Echo))]);
        let handler = ApusHandler(inner);

        let err = drive(handler.call(1, CallContext::detached("exec-1", 7), vec![])).await.unwrap_err();
        assert_eq!(err.code, "ACTION-UNKNOWN-METHOD");
    }

    #[tokio::test]
    async fn a_known_method_zips_its_positional_argument_by_declared_parameter_name() {
        let inner = build_inner(vec![("echo", vec!["value"], Arc::new(Echo))]);
        let handler = ApusHandler(inner);

        let result = drive(handler.call(0, CallContext::detached("exec-1", 7), vec![ApusValue::String("hi".into())])).await;
        assert_eq!(result.unwrap(), ApusValue::String("hi".into()));
    }

    struct InspectSubFlowParameter;

    #[async_trait]
    impl RuntimeFunctionHandler for InspectSubFlowParameter {
        async fn run(&self, ctx: &FunctionContext, args: &Arguments) -> HResult<RuntimeFunctionReturn> {
            assert!(args.raw("consumer").is_none(), "a sub-flow parameter must not also appear as a literal argument");
            assert_eq!(ctx.sub_flow_parameters.get("consumer"), Some(&"sub-42".to_string()));
            let apus = ctx.apus.as_ref().expect("a call that arrived over Apus always sets FunctionContext::apus");
            assert_eq!(apus.execution_id(), "exec-2");
            assert_eq!(apus.project_id(), 1);
            // "consumer" is a real sub-flow parameter but not connection-bound in
            // this test (`CallContext::detached`); an unknown name is rejected
            // before that matters.
            assert!(apus.invoke_sub_flow("not-a-parameter", vec![]).await.is_err());
            Ok(RuntimeFunctionReturn::Value(PlainValue::Bool(true)))
        }
    }

    #[tokio::test]
    async fn a_sub_flow_argument_is_routed_separately_from_literals() {
        let inner = build_inner(vec![("map", vec!["consumer"], Arc::new(InspectSubFlowParameter))]);
        let handler = ApusHandler(inner);
        let sub_flow_arg = ApusValue::SubFlow {
            id: "sub-42".into(),
            input_schema: Box::new(ApusValue::Null),
            output_schema: Box::new(ApusValue::Null),
        };

        let result = drive(handler.call(0, CallContext::detached("exec-2", 1), vec![sub_flow_arg])).await;
        assert_eq!(result.unwrap(), ApusValue::Bool(true));
    }

    struct Fails;

    #[async_trait]
    impl RuntimeFunctionHandler for Fails {
        async fn run(&self, _ctx: &FunctionContext, _args: &Arguments) -> HResult<RuntimeFunctionReturn> {
            Err(HerculesError::runtime("BOOM", Some("kaboom".to_string())))
        }
    }

    #[tokio::test]
    async fn a_handler_runtime_error_round_trips_its_code_and_message() {
        let inner = build_inner(vec![("fails", vec![], Arc::new(Fails))]);
        let handler = ApusHandler(inner);

        let err = drive(handler.call(0, CallContext::detached("exec-3", 1), vec![])).await.unwrap_err();
        assert_eq!(err.code, "BOOM");
        assert_eq!(err.category, "RUNTIME");
        assert_eq!(err.message, "kaboom");
    }
}
