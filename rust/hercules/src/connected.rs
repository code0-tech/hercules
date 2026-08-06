use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_stream::{Stream, StreamExt};
use tonic::Streaming;
use tucana::aquila::{
    action_flow_execution_response, action_flow_update, action_node_value, action_transfer_request,
    action_transfer_response, ActionEvent, ActionExecutionRequest, ActionExecutionResponse,
    ActionFlow, ActionFlowExecutionRequest, ActionFlowExecutionResponse, ActionFlowUpdate,
    ActionNodeValue, ActionTransferRequest, ActionTransferResponse,
};
use tucana::shared::{node_execution_result, Error as WireError, NodeExecutionResult};

use crate::arguments::Arguments;
use crate::error::{HerculesError, Result};
use crate::events::{event_stream, HerculesEvent};
use crate::function::RuntimeFunctionHandler;
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
    pub next_execution_seq: AtomicU64,
    pub request_tx: mpsc::UnboundedSender<ActionTransferRequest>,
    pub events_tx: broadcast::Sender<HerculesEvent>,
}

impl ConnectedInner {
    /// A locally-unique id for correlating an outgoing flow execution
    /// request with its eventual response.
    fn next_execution_id(&self) -> String {
        let seq = self.next_execution_seq.fetch_add(1, Ordering::Relaxed);
        format!("{}-{seq}", now_micros())
    }
}

/// A live, connected action. Cheap to clone (an `Arc` underneath) and safe to
/// share across tasks: [`Connected::fire`] and reads all go through shared
/// state that the background stream-reader task also touches under a lock.
#[derive(Clone)]
pub struct Connected {
    inner: Arc<ConnectedInner>,
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

    /// Sends an event payload for `project_id` up to Aquila.
    pub fn fire(
        &self,
        event_type: impl Into<String>,
        project_id: i64,
        payload: PlainValue,
    ) -> Result<()> {
        let request = ActionTransferRequest {
            data: Some(action_transfer_request::Data::Event(ActionEvent {
                event_type: event_type.into(),
                project_id,
                payload: Some(construct_value(&payload)),
            })),
        };
        send(&self.inner, request)
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
    /// Sub flow execution (a flow whose parameters reference the result of
    /// another in-flight flow) isn't supported yet.
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
    mut responses: Streaming<ActionTransferResponse>,
) {
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
    });
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
            log::warn!(
                "sub flow execution isn't supported yet; ignoring response for {:?}",
                response.execution_identifier
            );
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
    let context = FunctionContext {
        project_id: execution.project_id,
        execution_id: execution.execution_identifier.clone(),
        matched_config,
    };

    let started_at = now_micros();
    let outcome = match resolve_parameters(&entry.meta.parameters, execution.parameters) {
        Ok(values) => entry.handler.run(&context, &Arguments::new(values)).await,
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
            context.execution_id
        );
    }
}

/// Resolves positional wire parameters into a name -> value map, using
/// `meta`'s declaration order to recover each parameter's name.
///
/// A parameter can also reference the result of a sub flow execution
/// (`ActionNodeValue::SubFlow`), which isn't supported yet — such a
/// parameter fails the whole execution with a clear error instead of
/// silently passing a missing or wrong value to the handler.
fn resolve_parameters(
    meta: &[ParameterMeta],
    parameters: Vec<ActionNodeValue>,
) -> Result<HashMap<String, PlainValue>> {
    let mut values = HashMap::with_capacity(parameters.len());
    for (param_meta, param) in meta.iter().zip(parameters) {
        match param.value {
            Some(action_node_value::Value::LiteralValue(value)) => {
                values.insert(param_meta.runtime_name.clone(), to_allowed_value(value));
            }
            Some(action_node_value::Value::SubFlow(_)) => {
                return Err(HerculesError::runtime(
                    "SUB_FLOW_EXECUTION_UNSUPPORTED",
                    Some(format!(
                        "parameter {:?} references a sub flow result, but sub flow execution isn't supported yet",
                        param_meta.runtime_name
                    )),
                ));
            }
            None => {}
        }
    }
    Ok(values)
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
