use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::broadcast;
use tokio_stream::Stream;
use tucana::shared::Module;

use crate::connected::{spawn_dispatch_loop, Connected, ConnectedInner, RuntimeFunctionEntry};
use crate::connection;
use crate::data_type::{self, DataType, DataTypeDef};
use crate::error::Result;
use crate::event::{Event, RuntimeEvent};
use crate::events::{event_stream, HerculesEvent};
use crate::export;
use crate::function::{Function, RuntimeFunction};
use crate::meta::{
    merge_event, merge_event_unchecked, merge_function, merge_function_unchecked, EventDef,
    FunctionDef, RuntimeEventMeta,
};
use crate::module_builder::{build_module, ModuleBuildData};
use crate::registration;
use crate::types::{ConfigurationDefinition, ScalingOption, Translation};

const EVENT_CHANNEL_CAPACITY: usize = 256;

/// An action under construction: `#[hercules::runtime_function]` and friends
/// register themselves automatically (see [`crate::registration`]), so most
/// actions need nothing beyond `Action::new(...)` plus a handful of chained
/// setters. [`Action::register_runtime_function`] and friends remain for the
/// cases auto-registration can't cover — chiefly a `RuntimeFunction` whose
/// handler needs constructor-injected state.
///
/// This is a plain, single-owner builder that turns into a cheaply cloneable
/// [`Connected`] handle via [`Action::connect`]. That split exists because
/// after connecting, a background task reads the stream concurrently with
/// anything the caller does; the type change makes that boundary an
/// ownership transfer the compiler enforces, rather than a rule callers have
/// to remember on their own.
pub struct Action {
    identifier: String,
    version: String,
    aquila_url: Option<String>,
    scaling_option: ScalingOption,
    author: String,
    icon: String,
    documentation: String,
    name: Vec<Translation>,
    configuration_definitions: Vec<ConfigurationDefinition>,

    functions: HashMap<String, FunctionDef>,
    runtime_functions: HashMap<String, RuntimeFunctionEntry>,
    data_types: HashMap<String, DataTypeDef>,
    events: HashMap<String, EventDef>,
    runtime_events: HashMap<String, RuntimeEventMeta>,

    events_tx: broadcast::Sender<HerculesEvent>,
}

impl Action {
    /// Only `identifier` and `version` are required; everything else has a
    /// sensible empty default and can be set via the chained setters below.
    /// Every `#[hercules::...]`-annotated item linked into the binary is
    /// registered automatically as part of this call.
    pub fn new(identifier: impl Into<String>, version: impl Into<String>) -> Self {
        let (events_tx, _) = broadcast::channel(EVENT_CHANNEL_CAPACITY);
        let mut action = Self {
            identifier: identifier.into(),
            version: version.into(),
            aquila_url: None,
            scaling_option: ScalingOption::default(),
            author: String::new(),
            icon: String::new(),
            documentation: String::new(),
            name: Vec::new(),
            configuration_definitions: Vec::new(),
            functions: HashMap::new(),
            runtime_functions: HashMap::new(),
            data_types: HashMap::new(),
            events: HashMap::new(),
            runtime_events: HashMap::new(),
            events_tx,
        };
        registration::apply_all(&mut action);
        action
    }

    pub fn aquila_url(mut self, url: impl Into<String>) -> Self {
        self.aquila_url = Some(url.into());
        self
    }

    /// How Aquila should distribute this action's flows/configurations
    /// across multiple running instances of it. Defaults to
    /// [`ScalingOption::Disabled`] (every instance receives everything).
    pub fn scaling(mut self, option: ScalingOption) -> Self {
        self.scaling_option = option;
        self
    }

    pub fn author(mut self, author: impl Into<String>) -> Self {
        self.author = author.into();
        self
    }

    pub fn icon(mut self, icon: impl Into<String>) -> Self {
        self.icon = icon.into();
        self
    }

    pub fn documentation(mut self, documentation: impl Into<String>) -> Self {
        self.documentation = documentation.into();
        self
    }

    pub fn name(mut self, name: impl IntoIterator<Item = Translation>) -> Self {
        self.name = name.into_iter().collect();
        self
    }

    pub fn configuration(mut self, definition: ConfigurationDefinition) -> Self {
        self.configuration_definitions.push(definition);
        self
    }

    pub fn identifier(&self) -> &str {
        &self.identifier
    }

    pub fn version(&self) -> &str {
        &self.version
    }

    /// A live feed of connection/execution lifecycle events. Can be called
    /// before or after [`Action::connect`] — every subscriber gets its own
    /// view of the same underlying broadcast.
    pub fn subscribe(&self) -> impl Stream<Item = HerculesEvent> + Send + 'static {
        event_stream(&self.events_tx)
    }

    /// Registers a runtime function together with the handler instance that
    /// runs it. Unless its `meta()` sets `omit_definition`, it is also
    /// published as a same-named public [`Function`].
    ///
    /// Only needed for handlers `#[hercules::runtime_function(manual)]`
    /// opted out of auto-registration for — typically because they carry
    /// injected state a macro has no way to construct on its own.
    pub fn register_runtime_function<T: RuntimeFunction>(&mut self, instance: T) {
        let meta = T::meta();
        let entry = RuntimeFunctionEntry {
            meta: meta.clone(),
            handler: Arc::new(instance),
        };
        let omit_definition = meta.omit_definition;
        self.runtime_functions
            .insert(meta.identifier.clone(), entry);

        if !omit_definition {
            let identifier = meta.identifier.clone();
            let def = merge_function_unchecked(meta, Default::default());
            self.functions.insert(identifier, def);
        }
    }

    /// Registers a public [`Function`] that overrides metadata (identifier,
    /// parameter defaults, ...) on top of its `Base` [`RuntimeFunction`].
    /// The base must already be registered via [`Action::register_runtime_function`]
    /// — execution always dispatches through it, never through `F` itself.
    pub fn register_function<F: Function>(&mut self) -> Result<()> {
        let def = merge_function(F::Base::meta(), F::meta(), std::any::type_name::<F>())?;
        self.functions.insert(def.runtime_name.clone(), def);
        Ok(())
    }

    pub fn register_data_type<T: DataType>(&mut self) -> Result<()> {
        let def = data_type::resolve::<T>(T::meta())?;
        self.data_types.insert(def.identifier.clone(), def);
        Ok(())
    }

    /// Registers a runtime event. Unless its `meta()` sets `omit_definition`,
    /// it is also published as a same-named public [`Event`].
    pub fn register_runtime_event<T: RuntimeEvent>(&mut self) {
        let meta = T::meta();
        let omit_definition = meta.omit_definition;
        self.runtime_events
            .insert(meta.identifier.clone(), meta.clone());

        if !omit_definition {
            let identifier = meta.identifier.clone();
            let def = merge_event_unchecked(meta, Default::default());
            self.events.insert(identifier, def);
        }
    }

    /// Registers a public [`Event`] on top of its `Base` [`RuntimeEvent`],
    /// analogous to [`Action::register_function`].
    pub fn register_event<E: Event>(&mut self) -> Result<()> {
        let def = merge_event(E::Base::meta(), E::meta(), std::any::type_name::<E>())?;
        self.events.insert(def.identifier.clone(), def);
        Ok(())
    }

    pub fn build_module(&self) -> Module {
        build_module(ModuleBuildData {
            identifier: &self.identifier,
            version: &self.version,
            author: &self.author,
            icon: &self.icon,
            documentation: &self.documentation,
            name: &self.name,
            configuration_definitions: &self.configuration_definitions,
            data_types: self.data_types.values().collect(),
            events: self.events.values().collect(),
            runtime_events: self.runtime_events.values().collect(),
            functions: self.functions.values().collect(),
            runtime_functions: self.runtime_functions.values().map(|e| &e.meta).collect(),
        })
    }

    /// Writes this action's module to `dir` as a directory of JSON files —
    /// `meta.json` plus one file per data type / flow type / runtime flow
    /// type / function / runtime function — in the same layout and wire
    /// format Aquila would receive over `connect`. Lets an action's
    /// registrations be inspected or diffed without a running Aquila.
    pub fn export(&self, dir: impl AsRef<std::path::Path>) -> std::io::Result<()> {
        export::write(&self.build_module(), dir.as_ref())
    }

    /// Opens the connection to Aquila and starts dispatching incoming
    /// execution requests. Consumes the builder; the returned [`Connected`]
    /// is a cheap-to-clone handle usable from any task.
    pub async fn connect(
        self,
        auth_token: impl Into<String>,
        aquila_url: Option<String>,
    ) -> Result<Connected> {
        let module = self.build_module();
        let url = aquila_url
            .or(self.aquila_url)
            .ok_or(crate::error::HerculesError::MissingAquilaUrl)?;

        let connection =
            connection::connect(module, self.scaling_option, &auth_token.into(), &url).await?;

        let inner = Arc::new(ConnectedInner {
            identifier: self.identifier,
            version: self.version,
            runtime_functions: self.runtime_functions,
            configs: Default::default(),
            flows: Default::default(),
            pending_flow_executions: Default::default(),
            next_execution_seq: Default::default(),
            request_tx: connection.request_tx,
            events_tx: self.events_tx,
        });

        let _ = inner.events_tx.send(HerculesEvent::Connected);
        spawn_dispatch_loop(inner.clone(), connection.responses);

        Ok(Connected::new(inner))
    }
}
