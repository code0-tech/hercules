use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::sync::{broadcast, mpsc};
use tokio_stream::{Stream, StreamExt};
use tonic::Streaming;
use tucana::aquila::{
    action_transfer_request, action_transfer_response, ActionEvent, ActionExecutionRequest,
    ActionExecutionResponse, ActionTransferRequest, ActionTransferResponse,
};
use tucana::shared::{node_execution_result, Error as WireError, NodeExecutionResult};

use crate::arguments::Arguments;
use crate::error::{HerculesError, Result};
use crate::events::{event_stream, HerculesEvent};
use crate::function::RuntimeFunctionHandler;
use crate::meta::RuntimeFunctionMeta;
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
    pub request_tx: mpsc::UnboundedSender<ActionTransferRequest>,
    pub events_tx: broadcast::Sender<HerculesEvent>,
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

    // The wire already sends parameters as a name -> value map; pass that
    // straight through instead of re-flattening it into declaration order.
    let args = Arguments::new(
        execution
            .parameters
            .map(|s| {
                s.fields
                    .into_iter()
                    .map(|(k, v)| (k, to_allowed_value(v)))
                    .collect()
            })
            .unwrap_or_default(),
    );

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
    let outcome = entry.handler.run(&context, &args).await;
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
