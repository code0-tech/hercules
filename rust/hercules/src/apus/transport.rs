//! [`connect_apus`]: builds the module exactly like [`Action::connect`]
//! does, starts Aquila's gRPC control plane
//! (`apus_client::control::ControlPlane` — logon, module, per-project
//! configuration, flows, and a gRPC fallback for calls Taurus still routes
//! the old way) and the Apus data plane (`apus_client::ApusClient`), and
//! returns a [`Connected`] handle wired to both.

use std::sync::Arc;
use std::time::Duration;

use apus_client::control::{ControlPlane, ControlSettings, ControlState, Flow as ApusFlow};
use apus_client::protocol::status;
use apus_client::{ApusClient, Exec, Settings as ApusClientSettings};
use tokio::sync::mpsc;
use tucana::aquila::ActionFlow;
use tucana::shared::FlowSetting;

use crate::action::Action;
use crate::connected::{Connected, ConnectedInner};
use crate::error::{HerculesError, Result};
use crate::events::HerculesEvent;
use crate::types::PlainValue;

use super::handler::ApusHandler;
use super::value::{apus_to_plain, plain_to_apus};

/// Options for [`connect_apus`]; the Apus analogue of the `aquila_url`
/// argument [`Action::connect`] takes for the gRPC transport, plus the data
/// plane's own settings.
pub struct ApusSettings {
    /// Aquila's gRPC address for the control plane (logon, module, flows,
    /// per-project configuration) — unchanged from the gRPC transport.
    pub aquila_url: String,
    /// Apus endpoints (`host:port`) to bootstrap the data plane from;
    /// `ROUTES` adds every other Taurus instance that serves this action's
    /// projects.
    pub apus_endpoints: Vec<String>,
    /// Apus connections kept per Taurus instance. Defaults to 1.
    pub connections_per_instance: usize,
    /// `CALL`s accepted concurrently per Apus connection (0 = no limit).
    /// Defaults to 4096.
    pub max_in_flight: u32,
    /// Mutual TLS for the Apus connections (the client certificate, issued
    /// by Aquila's CA, is the action's identity). `None` means plain TCP —
    /// development only, see `apus/protocol/SPEC-v1.md`'s Security section.
    pub tls: Option<apus_client::protocol::tls::TlsConnector>,
    /// How long to wait for Aquila's control stream to come up before
    /// connecting the Apus data plane anyway (best-effort: a slow or
    /// down control plane does not block the data plane forever).
    pub control_wait: Duration,
}

impl ApusSettings {
    /// Defaults: one connection per Taurus instance, 4096 calls in flight,
    /// no TLS, a 10 second control-plane wait.
    pub fn new(aquila_url: impl Into<String>, apus_endpoints: Vec<String>) -> Self {
        Self {
            aquila_url: aquila_url.into(),
            apus_endpoints,
            connections_per_instance: 1,
            max_in_flight: 4096,
            tls: None,
            control_wait: Duration::from_secs(10),
        }
    }
}

/// What [`Connected`]'s methods dispatch to once this transport is in use —
/// see [`crate::connected::ConnectedInner::apus`].
pub(crate) struct ApusBacking {
    client: ApusClient,
    control: Arc<ControlState>,
    /// Kept alive so the control-plane task this was started with stays
    /// reachable for a future `stop()`; see
    /// `apus_client::control::ControlPlane`'s own docs — dropping it does
    /// *not* stop the task, only holding onto it to call `stop()` would.
    #[allow(dead_code)]
    control_plane: ControlPlane,
}

impl ApusBacking {
    pub(crate) fn project_for_flow(&self, flow_id: i64) -> Option<i64> {
        self.control.flows().iter().find(|flow| flow.flow_id == flow_id).map(|flow| flow.project_id)
    }

    pub(crate) async fn execute_flow(&self, flow_id: i64, project_id: i64, execution_id: String, payload: PlainValue) -> Result<PlainValue> {
        self.client
            .execute(Exec {
                flow_id,
                project_id,
                execution_id,
                deadline: None,
                input: plain_to_apus(&payload),
            })
            .await
            .map(|value| apus_to_plain(&value))
            .map_err(HerculesError::Apus)
    }

    pub(crate) fn config(&self, project_id: i64) -> Option<crate::types::ProjectConfiguration> {
        self.control.config(project_id).map(|config| crate::types::ProjectConfiguration {
            project_id,
            config_values: config.values.iter().map(|(k, v)| (k.clone(), apus_to_plain(v))).collect(),
        })
    }

    pub(crate) fn flows(&self) -> Vec<ActionFlow> {
        self.control.flows().iter().map(|flow| to_action_flow(flow)).collect()
    }
}

/// Converts the control plane's flow shape (`apus_client::control::Flow`,
/// settings already as [`super::ApusValue`]... — actually `ApusValue`) into
/// the same `tucana::aquila::ActionFlow` [`Connected::flows`] returns on the
/// gRPC transport, so callers see one shape regardless of transport.
/// `input_schema`/`output_schema` are not part of the control plane's flow
/// snapshot and are always `None` here.
fn to_action_flow(flow: &ApusFlow) -> ActionFlow {
    ActionFlow {
        flow_id: flow.flow_id,
        project_id: flow.project_id,
        r#type: flow.flow_type.clone(),
        settings: flow
            .settings
            .iter()
            .map(|(key, value)| FlowSetting {
                database_id: None,
                flow_setting_id: key.clone(),
                value: Some(apus_client::convert::to_value(value)),
                cast: None,
            })
            .collect(),
        input_schema: None,
        output_schema: None,
        project_slug: flow.project_slug.clone(),
        name: flow.name.clone(),
    }
}

fn apus_scaling(option: crate::types::ScalingOption) -> u8 {
    match option {
        crate::types::ScalingOption::Disabled => apus_client::protocol::scaling::DISABLED,
        crate::types::ScalingOption::Split => apus_client::protocol::scaling::SPLIT,
    }
}

/// Connects `action` over Apus instead of hercules's own gRPC data plane:
/// Aquila's gRPC control plane stays exactly as [`Action::connect`] leaves
/// it (module, per-project configuration, flows — via `apus_client`'s own
/// re-implementation of the same `ActionTransferService`), and a direct
/// Apus connection is opened to every Taurus instance that serves this
/// action's projects. See the [`crate::apus`] module docs for the boundary
/// this draws with the gRPC transport, and `apus/protocol/SPEC-v1.md` in
/// the sibling `apus` repository for the protocol itself.
///
/// `auth_token` is the action's Aquila secret, exactly as passed to
/// [`Action::connect`] (it signs the logon JWT the same way).
pub async fn connect_apus(action: Action, auth_token: impl Into<String>, settings: ApusSettings) -> Result<Connected> {
    let module = action.build_module();
    let parts = action.into_apus_parts();

    // Function runtime names in a fixed, deterministic order: this is both
    // Apus's `CALL` method index (`HELLO`'s function list) and the gRPC
    // fallback's lookup key (`ControlSettings::functions`), so the two
    // planes agree on it. `HashMap` iteration order is not it.
    let mut functions: Vec<String> = parts.runtime_functions.keys().cloned().collect();
    functions.sort();

    // The gRPC-shaped fields on `ConnectedInner` are unused on this
    // transport (every `Connected` method that would touch them checks
    // `apus` first) — give them inert values rather than duplicating the
    // struct. `request_tx`'s receiver is dropped immediately, so a send
    // through it (there should never be one) fails fast instead of hanging.
    let (request_tx, request_rx) = mpsc::channel(1);
    drop(request_rx);

    let inner = Arc::new(ConnectedInner {
        identifier: parts.identifier.clone(),
        version: parts.version.clone(),
        runtime_functions: parts.runtime_functions,
        configs: Default::default(),
        flows: Default::default(),
        pending_flow_executions: Default::default(),
        pending_sub_flow_executions: Default::default(),
        next_pending_token: Default::default(),
        request_tx,
        queue_saturation_count: Default::default(),
        events_tx: parts.events_tx,
        sub_flow_functions: Default::default(),
        sub_flow_function_ttl: crate::sub_flow_function::SUB_FLOW_FUNCTION_TTL,
        apus: Default::default(),
        apus_function_names: functions.clone(),
    });

    // The same handler answers both planes: direct `CALL`s over Apus, and
    // the gRPC fallback `ControlPlane` uses for calls Taurus still routes
    // the old way (no direct Apus connection to this action yet).
    let handler: Arc<ApusHandler> = Arc::new(ApusHandler(inner.clone()));

    let control_state = Arc::new(ControlState::default());
    let control_plane = ControlPlane::start(
        ControlSettings {
            url: settings.aquila_url,
            action: parts.identifier.clone(),
            secret: auth_token.into(),
            module,
            scaling: parts.scaling_option.into_wire(),
            functions: functions.clone(),
        },
        control_state.clone(),
        handler.clone(),
    );
    if !control_plane.wait_for(settings.control_wait, ControlState::is_connected).await {
        log::warn!("apus: Aquila control plane did not come up within {:?}; connecting Apus anyway", settings.control_wait);
    }

    let mut client_settings = ApusClientSettings::new(parts.identifier.clone(), settings.apus_endpoints);
    client_settings.functions = functions;
    client_settings.connections_per_instance = settings.connections_per_instance;
    client_settings.max_in_flight = settings.max_in_flight;
    client_settings.scaling = apus_scaling(parts.scaling_option);
    client_settings.tls = settings.tls;

    let client = ApusClient::connect(client_settings, handler)
        .await
        .map_err(HerculesError::ApusConnect)?;
    client.set_status(status::RUNNING);

    // No `CALL` can have reached `ApusHandler` before this, since Taurus
    // routes calls only once the action reports `running` — set just above.
    let _ = inner.apus.set(ApusBacking {
        client,
        control: control_state,
        control_plane,
    });

    let _ = inner.events_tx.send(HerculesEvent::Connected);
    Ok(Connected::new(inner))
}

