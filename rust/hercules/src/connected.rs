use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_stream::{Stream, StreamExt};
use tonic::Streaming;
use tucana::aquila::{
    action_flow_execution_response, action_node_value, action_flow_update,
    action_sub_flow_execution_response, action_transfer_request, action_transfer_response,
    ActionExecutionRequest, ActionExecutionResponse, ActionFlow, ActionFlowExecutionRequest,
    ActionFlowExecutionResponse, ActionFlowUpdate, ActionNodeValue, ActionSubFlowExecutionRequest,
    ActionSubFlowExecutionResponse, ActionTransferRequest, ActionTransferResponse,
};
use tucana::shared::{node_execution_result, Error as WireError, NodeExecutionResult};

use crate::arguments::Arguments;
use crate::error::{HerculesError, Result};
use crate::events::{event_stream, HerculesEvent};
use crate::function::RuntimeFunctionHandler;
use crate::literal::{resolve_literal, ResolvedValue};
use crate::meta::{ParameterMeta, RuntimeFunctionMeta};
use crate::sync;
use crate::types::{FunctionContext, PlainValue, ProjectConfiguration};
use crate::value::{construct_value, to_allowed_value};

pub(crate) struct RuntimeFunctionEntry {
    pub meta: RuntimeFunctionMeta,
    pub handler: Arc<dyn RuntimeFunctionHandler>,
}

pub(crate) struct ConnectedInner {
    pub identifier: String,
    pub version: String,
    pub runtime_functions: HashMap<String, RuntimeFunctionEntry>,
    pub configs: RwLock<HashMap<i64, ProjectConfiguration>>,
    /// The action's own flows, as last pushed down by Aquila via
    /// `ActionFlowUpdate` — keyed by `flow_id`.
    pub flows: RwLock<HashMap<i64, ActionFlow>>,
    /// Flow executions this action has requested (via
    /// [`Connected::execute_flow`]) and is still awaiting a result for,
    /// keyed by the `execution_identifier` that correlates the eventual
    /// `ActionFlowExecutionResponse`.
    pub pending_flow_executions: Mutex<HashMap<String, oneshot::Sender<Result<PlainValue>>>>,
    /// Sub flow executions this action has requested (via
    /// [`Connected::execute_sub_flow`]) and is still awaiting a result for,
    /// keyed by a locally-generated `correlation_identifier` — not the sub
    /// flow's `execution_identifier`, which is minted by taurus and reused
    /// across every call to the same sub flow (e.g. once per loop
    /// iteration), so it cannot disambiguate concurrent or out-of-order
    /// invocations the way the correlation identifier can. See
    /// [`crate::types::FunctionContext::sub_flow_parameters`].
    pub pending_sub_flow_executions: Mutex<HashMap<String, oneshot::Sender<Result<PlainValue>>>>,
    pub request_tx: mpsc::UnboundedSender<ActionTransferRequest>,
    pub events_tx: broadcast::Sender<HerculesEvent>,
}

impl ConnectedInner {
    /// A locally-unique id for correlating an outgoing flow execution
    /// request with its eventual response.
    ///
    /// Must be a UUID: taurus parses the NATS subject it publishes
    /// executions on (`execution.<uuid>`) with `Uuid::parse_str` and, on a
    /// non-UUID id, silently substitutes a freshly generated one instead of
    /// rejecting the request — which breaks the correlation this id exists
    /// for.
    fn next_execution_id(&self) -> String {
        uuid::Uuid::new_v4().to_string()
    }
}

/// A live, connected action. Cheap to clone (an `Arc` underneath) and safe to
/// share across tasks: [`Connected::fire`] and reads all go through shared
/// state that the background stream-reader task also touches under a lock.
#[derive(Clone)]
pub struct Connected {
    inner: Arc<ConnectedInner>,
}

impl std::fmt::Debug for Connected {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Connected")
            .field("identifier", &self.inner.identifier)
            .field("version", &self.inner.version)
            .finish_non_exhaustive()
    }
}

impl Connected {
    pub(crate) fn new(inner: Arc<ConnectedInner>) -> Self {
        Self { inner }
    }

    pub fn identifier(&self) -> &str {
        &self.inner.identifier
    }

    pub fn version(&self) -> &str {
        &self.inner.version
    }

    pub fn subscribe(&self) -> impl Stream<Item = HerculesEvent> + Send + 'static {
        event_stream(&self.inner.events_tx)
    }

    /// The configuration Aquila has resolved for `project_id`, if any has
    /// been pushed down yet.
    pub fn config(&self, project_id: i64) -> Option<ProjectConfiguration> {
        sync::read(&self.inner.configs).get(&project_id).cloned()
    }

    /// Executes every one of this action's own flows whose type matches
    /// `identifier` and awaits all of their results.
    ///
    /// `identifier` is the same string a flow's type is registered under —
    /// what `#[hercules::event(identifier = "...")]` /
    /// `#[hercules::runtime_event(identifier = "...")]` declare on the
    /// corresponding [`crate::event::Event`]/[`crate::event::RuntimeEvent`].
    /// Flows are tracked from the `ActionFlowUpdate` messages Aquila streams
    /// (see [`Connected::flows`]); each match is run via
    /// [`Connected::execute_flow`].
    ///
    /// To run a single flow by id instead, call [`Connected::execute_flow`]
    /// directly.
    pub async fn fire(
        &self,
        identifier: impl Into<String>,
        payload: PlainValue,
    ) -> Result<Vec<PlainValue>> {
        let identifier = identifier.into();
        let flow_ids: Vec<i64> = sync::read(&self.inner.flows)
            .values()
            .filter(|flow| flow.r#type == identifier)
            .map(|flow| flow.flow_id)
            .collect();

        let mut results = Vec::with_capacity(flow_ids.len());
        for flow_id in flow_ids {
            results.push(self.execute_flow(flow_id.to_string(), payload.clone()).await?);
        }
        Ok(results)
    }

    /// This action's own flows, as last pushed down by Aquila. Kept in sync
    /// via `ActionFlowUpdate` messages — see [`HerculesEvent::FlowUpserted`]
    /// / [`HerculesEvent::FlowDeleted`] to react to changes as they happen.
    pub fn flows(&self) -> Vec<ActionFlow> {
        sync::read(&self.inner.flows).values().cloned().collect()
    }

    /// A single one of this action's flows by id, if Aquila has pushed it
    /// down.
    pub fn flow(&self, flow_id: i64) -> Option<ActionFlow> {
        sync::read(&self.inner.flows).get(&flow_id).cloned()
    }

    /// Asks Aquila to execute one of this action's own flows and awaits its
    /// result.
    ///
    /// To run a sub flow — a node range within an in-flight parent
    /// execution's flow, rather than a whole standalone flow — use
    /// [`Connected::execute_sub_flow`] instead.
    pub async fn execute_flow(
        &self,
        flow_id: impl Into<String>,
        payload: PlainValue,
    ) -> Result<PlainValue> {
        let execution_identifier = self.inner.next_execution_id();
        self.execute_flow_with_id(execution_identifier, flow_id, payload)
            .await
    }

    /// Reserves a locally-unique execution id ahead of starting a flow.
    ///
    /// Only needed by callers that must correlate an out-of-band signal
    /// (e.g. a runtime function the flow calls mid-execution, whose
    /// `FunctionContext::execution_id` matches the flow's own execution id)
    /// back to this specific run, and so need the id fixed *before* the flow
    /// starts — pass it to [`Connected::execute_flow_with_id`] instead of
    /// [`Connected::execute_flow`], which reserves its own.
    pub fn reserve_execution_id(&self) -> String {
        self.inner.next_execution_id()
    }

    /// Same as [`Connected::execute_flow`], but for a caller that already
    /// reserved `execution_identifier` via [`Connected::reserve_execution_id`].
    pub async fn execute_flow_with_id(
        &self,
        execution_identifier: String,
        flow_id: impl Into<String>,
        payload: PlainValue,
    ) -> Result<PlainValue> {
        let (tx, rx) = oneshot::channel();
        sync::lock(&self.inner.pending_flow_executions).insert(execution_identifier.clone(), tx);

        let request = ActionTransferRequest {
            data: Some(action_transfer_request::Data::FlowExecution(
                ActionFlowExecutionRequest {
                    execution_identifier: execution_identifier.clone(),
                    flow_id: flow_id.into(),
                    payload: Some(construct_value(&payload)),
                },
            )),
        };
        if let Err(err) = send(&self.inner, request) {
            sync::lock(&self.inner.pending_flow_executions).remove(&execution_identifier);
            return Err(err);
        }

        rx.await.map_err(|_| HerculesError::StreamClosed)?
    }

    /// Runs a sub flow — a node range within an in-flight parent execution's
    /// flow — and awaits its result. `execution_identifier` is not minted
    /// here: it comes from [`crate::types::FunctionContext::sub_flow_parameters`],
    /// where taurus already assigned it when it compiled the calling node's
    /// parameters. Can be called any number of times with the same id while
    /// the parent call is outstanding.
    pub async fn execute_sub_flow(
        &self,
        execution_identifier: impl Into<String>,
        parameters: Vec<PlainValue>,
    ) -> Result<PlainValue> {
        let execution_identifier = execution_identifier.into();
        // Scope this individual invocation with a fresh correlation identifier so
        // its response can be matched even when the same sub flow is executed
        // repeatedly and responses arrive out of order.
        let correlation_identifier = self.inner.next_execution_id();
        let (tx, rx) = oneshot::channel();
        sync::lock(&self.inner.pending_sub_flow_executions)
            .insert(correlation_identifier.clone(), tx);

        let request = ActionTransferRequest {
            data: Some(action_transfer_request::Data::SubFlowExecution(
                ActionSubFlowExecutionRequest {
                    execution_identifier,
                    parameters: parameters.iter().map(construct_value).collect(),
                    correlation_identifier: correlation_identifier.clone(),
                },
            )),
        };
        if let Err(err) = send(&self.inner, request) {
            sync::lock(&self.inner.pending_sub_flow_executions).remove(&correlation_identifier);
            return Err(err);
        }

        rx.await.map_err(|_| HerculesError::StreamClosed)?
    }
}

fn send(inner: &ConnectedInner, request: ActionTransferRequest) -> Result<()> {
    log::trace!("sending {request:?}");
    inner
        .request_tx
        .send(request)
        .map_err(|_| HerculesError::StreamClosed)
}

pub(crate) fn spawn_dispatch_loop(
    inner: Arc<ConnectedInner>,
    responses: Streaming<ActionTransferResponse>,
) {
    spawn_dispatch_loop_over(inner, responses);
}

/// The guts of [`spawn_dispatch_loop`], generic over the response stream
/// type so tests can drive it with a mock stream instead of a real gRPC
/// `Streaming<ActionTransferResponse>` (which needs a live connection to
/// construct).
fn spawn_dispatch_loop_over<S>(inner: Arc<ConnectedInner>, mut responses: S)
where
    S: Stream<Item = std::result::Result<ActionTransferResponse, tonic::Status>>
        + Unpin
        + Send
        + 'static,
{
    tokio::spawn(async move {
        while let Some(message) = responses.next().await {
            match message {
                Ok(response) => handle_response(&inner, response),
                Err(status) => {
                    let _ = inner.events_tx.send(HerculesEvent::Error(Arc::new(
                        HerculesError::Status(status),
                    )));
                }
            }
        }
        // The stream ended, either cleanly or on error: nothing will ever
        // resolve requests still awaiting a response. Fail every pending
        // caller instead of leaving them parked on their oneshot forever.
        drain_pending(&inner.pending_flow_executions);
        drain_pending(&inner.pending_sub_flow_executions);
    });
}

/// Resolves every outstanding sender in a pending-execution map with
/// [`HerculesError::StreamClosed`], used when the response stream has ended
/// and nothing will ever answer them.
fn drain_pending(pending: &Mutex<HashMap<String, oneshot::Sender<Result<PlainValue>>>>) {
    for (_, sender) in sync::lock(pending).drain() {
        let _ = sender.send(Err(HerculesError::StreamClosed));
    }
}

fn handle_response(inner: &Arc<ConnectedInner>, response: ActionTransferResponse) {
    log::trace!("received {response:?}");

    match response.data {
        Some(action_transfer_response::Data::ModuleConfigurations(configurations)) => {
            let mut configs = sync::write(&inner.configs);
            configs.clear();
            for project in &configurations.module_configurations {
                let config_values = project
                    .module_configurations
                    .iter()
                    .map(|c| {
                        (
                            c.identifier.clone(),
                            c.value
                                .clone()
                                .map(to_allowed_value)
                                .unwrap_or(PlainValue::Null),
                        )
                    })
                    .collect();
                configs.insert(
                    project.project_id,
                    ProjectConfiguration {
                        project_id: project.project_id,
                        config_values,
                    },
                );
            }
            drop(configs);
            let _ = inner
                .events_tx
                .send(HerculesEvent::ModuleUpdated(Arc::new(configurations)));
        }
        Some(action_transfer_response::Data::Execution(execution)) => {
            let _ = inner
                .events_tx
                .send(HerculesEvent::ExecutionRequestReceived(Arc::new(
                    execution.clone(),
                )));
            tokio::spawn(handle_execution(inner.clone(), execution));
        }
        Some(action_transfer_response::Data::FlowUpdate(update)) => {
            handle_flow_update(inner, update);
        }
        Some(action_transfer_response::Data::FlowExecutionResponse(response)) => {
            handle_flow_execution_response(inner, response);
        }
        Some(action_transfer_response::Data::SubFlowExecutionResponse(response)) => {
            handle_sub_flow_execution_response(inner, response);
        }
        None => {
            let _ = inner
                .events_tx
                .send(HerculesEvent::Error(Arc::new(HerculesError::Other(
                    "received unknown message type from stream".into(),
                ))));
        }
    }
}

fn now_micros() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_micros() as i64)
        .unwrap_or_default()
}

async fn handle_execution(inner: Arc<ConnectedInner>, execution: ActionExecutionRequest) {
    let Some(entry) = inner.runtime_functions.get(&execution.function_identifier) else {
        log::error!(
            "execution request for unknown function {:?}",
            execution.function_identifier
        );
        return;
    };

    let matched_config = sync::read(&inner.configs)
        .get(&execution.project_id)
        .cloned()
        .unwrap_or(ProjectConfiguration {
            project_id: execution.project_id,
            config_values: HashMap::new(),
        });
    let execution_identifier = execution.execution_identifier.clone();
    let started_at = now_micros();
    let outcome = match resolve_parameters(&entry.meta.parameters, execution.parameters) {
        Ok(ResolvedParameters {
            literals,
            sub_flow_parameters,
        }) => {
            let context = FunctionContext {
                project_id: execution.project_id,
                execution_id: execution_identifier.clone(),
                matched_config,
                connected: Connected::new(inner.clone()),
                sub_flow_parameters,
            };
            entry.handler.run(&context, &Arguments::new(literals)).await
        }
        Err(err) => Err(err),
    };
    let finished_at = now_micros();

    let result = match outcome {
        Ok(value) => node_execution_result::Result::Success(construct_value(&value)),
        Err(HerculesError::Runtime { code, description }) => {
            node_execution_result::Result::Error(wire_error(
                code,
                description.unwrap_or_default(),
                finished_at,
                &inner.version,
            ))
        }
        Err(other) => node_execution_result::Result::Error(wire_error(
            "UNKNOWN_ERROR".into(),
            other.to_string(),
            finished_at,
            &inner.version,
        )),
    };

    let request = ActionTransferRequest {
        data: Some(action_transfer_request::Data::Result(
            ActionExecutionResponse {
                execution_identifier: execution.execution_identifier,
                node_result: Some(NodeExecutionResult {
                    started_at,
                    finished_at,
                    parameter_results: vec![],
                    id: None,
                    result: Some(result),
                }),
            },
        )),
    };
    if send(&inner, request).is_err() {
        log::error!(
            "failed to send execution result for {:?}: stream closed",
            execution_identifier
        );
    }
}

/// The result of splitting a function execution's positional wire
/// parameters by kind. See [`resolve_parameters`].
struct ResolvedParameters {
    /// Parameters that arrived as an already-resolved literal value, keyed
    /// by `runtime_name`. Handed to the handler as its [`Arguments`].
    literals: HashMap<String, PlainValue>,
    /// Parameters that arrived as a reference to a sub flow instead of a
    /// literal, keyed by `runtime_name` and mapping to the
    /// `execution_identifier` a handler can pass to
    /// [`Connected::execute_sub_flow`]. Surfaced via
    /// [`FunctionContext::sub_flow_parameters`].
    sub_flow_parameters: HashMap<String, String>,
}

/// Resolves positional wire parameters into name-keyed maps, using `meta`'s
/// declaration order to recover each parameter's name.
///
/// A parameter can either be an already-resolved literal value
/// (`ActionNodeValue::LiteralValue`) or a reference to a sub flow execution
/// (`ActionNodeValue::SubFlow`) that the handler can run on demand via
/// [`Connected::execute_sub_flow`]. Both are routed into their own map
/// rather than failing the execution — a handler decides for itself how to
/// interpret an unset literal vs. a sub flow reference for a given
/// parameter.
fn resolve_parameters(
    meta: &[ParameterMeta],
    parameters: Vec<ActionNodeValue>,
) -> Result<ResolvedParameters> {
    let mut literals = HashMap::with_capacity(parameters.len());
    let mut sub_flow_parameters = HashMap::new();
    for (param_meta, param) in meta.iter().zip(parameters) {
        match param.value {
            Some(action_node_value::Value::LiteralValue(value)) => {
                match resolve_literal(value)? {
                    ResolvedValue::Literal(value) => {
                        literals.insert(param_meta.runtime_name.clone(), value);
                    }
                    // The literal's sole `${signature}` placeholder resolved to a
                    // sub flow reference — route it the same way a top-level
                    // `ActionNodeValue::SubFlow` is routed below.
                    ResolvedValue::SubFlow(sub_flow) => {
                        sub_flow_parameters
                            .insert(param_meta.runtime_name.clone(), sub_flow.execution_identifier);
                    }
                }
            }
            Some(action_node_value::Value::SubFlow(sub_flow)) => {
                sub_flow_parameters
                    .insert(param_meta.runtime_name.clone(), sub_flow.execution_identifier);
            }
            None => {}
        }
    }
    Ok(ResolvedParameters {
        literals,
        sub_flow_parameters,
    })
}

fn handle_flow_update(inner: &Arc<ConnectedInner>, update: ActionFlowUpdate) {
    match update.data {
        Some(action_flow_update::Data::UpdatedFlow(flow)) => {
            let unchanged = sync::read(&inner.flows).get(&flow.flow_id) == Some(&flow);
            sync::write(&inner.flows).insert(flow.flow_id, flow.clone());
            if !unchanged {
                let _ = inner
                    .events_tx
                    .send(HerculesEvent::FlowUpserted(Arc::new(flow)));
            }
        }
        Some(action_flow_update::Data::DeletedFlow(flow_id)) => {
            sync::write(&inner.flows).remove(&flow_id);
            let _ = inner.events_tx.send(HerculesEvent::FlowDeleted(flow_id));
        }
        None => {
            let _ = inner
                .events_tx
                .send(HerculesEvent::Error(Arc::new(HerculesError::Other(
                    "received a flow update with no data".into(),
                ))));
        }
    }
}

fn handle_flow_execution_response(
    inner: &Arc<ConnectedInner>,
    response: ActionFlowExecutionResponse,
) {
    let sender = sync::lock(&inner.pending_flow_executions).remove(&response.execution_identifier);
    let Some(sender) = sender else {
        log::warn!(
            "received a flow execution response for unknown execution {:?}",
            response.execution_identifier
        );
        return;
    };

    let outcome = match response.result {
        Some(action_flow_execution_response::Result::Success(value)) => Ok(to_allowed_value(value)),
        Some(action_flow_execution_response::Result::Failure(err)) => {
            Err(HerculesError::runtime(err.code, Some(err.message)))
        }
        None => Err(HerculesError::Other(
            "flow execution response is missing a result".into(),
        )),
    };
    let _ = sender.send(outcome);
}

fn handle_sub_flow_execution_response(
    inner: &Arc<ConnectedInner>,
    response: ActionSubFlowExecutionResponse,
) {
    let sender = sync::lock(&inner.pending_sub_flow_executions)
        .remove(&response.correlation_identifier);
    let Some(sender) = sender else {
        log::warn!(
            "received a sub flow execution response for unknown correlation id {:?}",
            response.correlation_identifier
        );
        return;
    };

    let outcome = match response.result {
        Some(action_sub_flow_execution_response::Result::Success(value)) => {
            Ok(to_allowed_value(value))
        }
        Some(action_sub_flow_execution_response::Result::Failure(err)) => {
            Err(HerculesError::runtime(err.code, Some(err.message)))
        }
        None => Err(HerculesError::Other(
            "sub flow execution response is missing a result".into(),
        )),
    };
    let _ = sender.send(outcome);
}

fn wire_error(code: String, message: String, timestamp: i64, version: &str) -> WireError {
    WireError {
        code,
        category: "RUNTIME".into(),
        message,
        timestamp,
        version: version.to_string(),
        dependencies: HashMap::new(),
        details: None,
    }
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use tokio::sync::mpsc as tokio_mpsc;
    use tokio_stream::wrappers::ReceiverStream;
    use tucana::aquila::{ActionLiteralValue, ActionNodeSubFlowValue};

    /// Wraps a plain value as a reference-free `ActionLiteralValue`, the
    /// common case exercised by these tests.
    fn literal(value: &PlainValue) -> ActionLiteralValue {
        ActionLiteralValue {
            value: Some(construct_value(value)),
            references: vec![],
        }
    }

    use super::*;

    /// A bare `ConnectedInner` with no runtime functions and a request
    /// channel the test can inspect, mirroring the shape [`crate::action`]
    /// builds one with in [`crate::Action::connect`].
    fn test_inner() -> (
        Arc<ConnectedInner>,
        mpsc::UnboundedReceiver<ActionTransferRequest>,
    ) {
        let (request_tx, request_rx) = mpsc::unbounded_channel();
        let (events_tx, _events_rx) = broadcast::channel(16);
        let inner = Arc::new(ConnectedInner {
            identifier: "test-action".into(),
            version: "0.0.0".into(),
            runtime_functions: HashMap::new(),
            configs: Default::default(),
            flows: Default::default(),
            pending_flow_executions: Default::default(),
            pending_sub_flow_executions: Default::default(),
            request_tx,
            events_tx,
        });
        (inner, request_rx)
    }

    #[tokio::test]
    async fn execute_sub_flow_sends_positional_parameters() {
        let (inner, mut request_rx) = test_inner();
        let connected = Connected::new(inner.clone());

        let params = vec![serde_json::json!(1), serde_json::json!("two")];
        let handle = tokio::spawn({
            let connected = connected.clone();
            async move { connected.execute_sub_flow("sub-1", params).await }
        });

        let request = request_rx.recv().await.expect("a request was sent");
        let correlation_identifier = match request.data {
            Some(action_transfer_request::Data::SubFlowExecution(req)) => {
                assert_eq!(req.execution_identifier, "sub-1");
                // Positional, not a single `payload` like ActionFlowExecutionRequest.
                assert_eq!(req.parameters.len(), 2);
                assert_eq!(to_allowed_value(req.parameters[0].clone()), serde_json::json!(1));
                assert_eq!(
                    to_allowed_value(req.parameters[1].clone()),
                    serde_json::json!("two")
                );
                req.correlation_identifier
            }
            other => panic!("expected a SubFlowExecution request, got {other:?}"),
        };

        // Resolve it so the spawned task completes instead of hanging.
        handle_sub_flow_execution_response(
            &inner,
            ActionSubFlowExecutionResponse {
                execution_identifier: "sub-1".into(),
                correlation_identifier,
                result: Some(action_sub_flow_execution_response::Result::Success(
                    construct_value(&serde_json::json!("done")),
                )),
            },
        );

        let result = handle.await.unwrap().unwrap();
        assert_eq!(result, serde_json::json!("done"));
    }

    #[tokio::test]
    async fn sub_flow_execution_response_resolves_the_matching_pending_future() {
        let (inner, _request_rx) = test_inner();

        let (success_tx, success_rx) = oneshot::channel();
        sync::lock(&inner.pending_sub_flow_executions).insert("id-a".into(), success_tx);
        let (failure_tx, failure_rx) = oneshot::channel();
        sync::lock(&inner.pending_sub_flow_executions).insert("id-b".into(), failure_tx);

        handle_sub_flow_execution_response(
            &inner,
            ActionSubFlowExecutionResponse {
                execution_identifier: "sub-a".into(),
                correlation_identifier: "id-a".into(),
                result: Some(action_sub_flow_execution_response::Result::Success(
                    construct_value(&serde_json::json!(42)),
                )),
            },
        );
        assert_eq!(success_rx.await.unwrap().unwrap(), serde_json::json!(42));

        // "id-b" must still be pending: the response for "id-a" shouldn't
        // have touched it.
        handle_sub_flow_execution_response(
            &inner,
            ActionSubFlowExecutionResponse {
                execution_identifier: "sub-b".into(),
                correlation_identifier: "id-b".into(),
                result: Some(action_sub_flow_execution_response::Result::Failure(
                    WireError {
                        code: "BOOM".into(),
                        category: "RUNTIME".into(),
                        message: "kaboom".into(),
                        timestamp: 0,
                        version: "0.0.0".into(),
                        dependencies: HashMap::new(),
                        details: None,
                    },
                )),
            },
        );
        match failure_rx.await.unwrap() {
            Err(HerculesError::Runtime { code, description }) => {
                assert_eq!(code, "BOOM");
                assert_eq!(description.as_deref(), Some("kaboom"));
            }
            other => panic!("expected a runtime error, got {other:?}"),
        }

        // An unknown execution id is logged and dropped, not a panic.
        handle_sub_flow_execution_response(
            &inner,
            ActionSubFlowExecutionResponse {
                execution_identifier: "sub-unknown".into(),
                correlation_identifier: "unknown-id".into(),
                result: None,
            },
        );
    }

    #[test]
    fn resolve_parameters_routes_sub_flow_values_separately_from_literals() {
        let meta = vec![
            ParameterMeta {
                runtime_name: "literal_param".into(),
                ..Default::default()
            },
            ParameterMeta {
                runtime_name: "sub_flow_param".into(),
                ..Default::default()
            },
            ParameterMeta {
                runtime_name: "unset_param".into(),
                ..Default::default()
            },
        ];
        let parameters = vec![
            ActionNodeValue {
                value: Some(action_node_value::Value::LiteralValue(literal(
                    &serde_json::json!("hi"),
                ))),
            },
            ActionNodeValue {
                value: Some(action_node_value::Value::SubFlow(ActionNodeSubFlowValue {
                    execution_identifier: "sub-xyz".into(),
                    input_schema: None,
                    output_schema: None,
                })),
            },
            ActionNodeValue { value: None },
        ];

        let resolved =
            resolve_parameters(&meta, parameters).expect("sub flow values no longer error");

        assert_eq!(
            resolved.literals.get("literal_param"),
            Some(&serde_json::json!("hi"))
        );
        assert!(!resolved.literals.contains_key("sub_flow_param"));
        assert!(!resolved.literals.contains_key("unset_param"));

        assert_eq!(
            resolved.sub_flow_parameters.get("sub_flow_param"),
            Some(&"sub-xyz".to_string())
        );
        assert!(!resolved.sub_flow_parameters.contains_key("literal_param"));
    }

    #[test]
    fn resolve_parameters_literal_only_case_is_unchanged() {
        let meta = vec![ParameterMeta {
            runtime_name: "a".into(),
            ..Default::default()
        }];
        let parameters = vec![ActionNodeValue {
            value: Some(action_node_value::Value::LiteralValue(literal(
                &serde_json::json!(7),
            ))),
        }];

        let resolved = resolve_parameters(&meta, parameters).unwrap();
        assert_eq!(resolved.literals, HashMap::from([("a".to_string(), serde_json::json!(7))]));
        assert!(resolved.sub_flow_parameters.is_empty());
    }

    #[tokio::test]
    async fn closing_the_response_stream_resolves_pending_execute_sub_flow_with_stream_closed() {
        let (inner, mut request_rx) = test_inner();
        let connected = Connected::new(inner.clone());

        let (stream_tx, stream_rx) = tokio_mpsc::channel::<
            std::result::Result<ActionTransferResponse, tonic::Status>,
        >(1);
        spawn_dispatch_loop_over(inner.clone(), ReceiverStream::new(stream_rx));

        let handle = tokio::spawn({
            let connected = connected.clone();
            async move { connected.execute_sub_flow("sub-pending", vec![]).await }
        });

        // Wait for the request to actually land in the pending map before
        // closing the stream, then close it by dropping the sender.
        request_rx.recv().await.expect("a request was sent");
        drop(stream_tx);

        let result = tokio::time::timeout(Duration::from_secs(2), handle)
            .await
            .expect("execute_sub_flow hung instead of resolving on stream close")
            .unwrap();
        assert!(matches!(result, Err(HerculesError::StreamClosed)));
    }

    #[tokio::test]
    async fn closing_the_response_stream_resolves_pending_execute_flow_with_stream_closed() {
        let (inner, mut request_rx) = test_inner();
        let connected = Connected::new(inner.clone());

        let (stream_tx, stream_rx) = tokio_mpsc::channel::<
            std::result::Result<ActionTransferResponse, tonic::Status>,
        >(1);
        spawn_dispatch_loop_over(inner.clone(), ReceiverStream::new(stream_rx));

        let handle = tokio::spawn({
            let connected = connected.clone();
            async move {
                connected
                    .execute_flow_with_id(
                        "flow-pending".into(),
                        "flow-1",
                        serde_json::json!(null),
                    )
                    .await
            }
        });

        request_rx.recv().await.expect("a request was sent");
        drop(stream_tx);

        let result = tokio::time::timeout(Duration::from_secs(2), handle)
            .await
            .expect("execute_flow_with_id hung instead of resolving on stream close")
            .unwrap();
        assert!(matches!(result, Err(HerculesError::StreamClosed)));
    }
}
