use thiserror::Error;

/// Everything that can go wrong in the SDK: connection failures, malformed
/// registrations, and errors a [`crate::function::RuntimeFunctionHandler`]
/// reports back to Aquila.
#[derive(Debug, Error)]
pub enum HerculesError {
    /// A function handler's own reported failure. Distinct from other
    /// variants so it round-trips through the wire `Error` message with a
    /// caller-chosen `code` instead of the generic `"UNKNOWN_ERROR"`.
    #[error("runtime error {code}{}", description.as_deref().map(|d| format!(": {d}")).unwrap_or_default())]
    Runtime {
        code: String,
        description: Option<String>,
    },

    #[error("{0}")]
    Other(String),

    #[error("aquila_url must be provided in Action::new or Action::connect")]
    MissingAquilaUrl,

    #[error(transparent)]
    Transport(#[from] tonic::transport::Error),

    #[error(transparent)]
    Status(#[from] tonic::Status),

    /// Decoding a parameter or configuration value with `serde_json` failed
    /// — lets a [`crate::function::RuntimeFunctionHandler`] use `?` when
    /// pulling typed arguments out of [`crate::Arguments`].
    #[error(transparent)]
    Json(#[from] serde_json::Error),

    #[error("missing required parameter {0:?}")]
    MissingParameter(String),

    #[error("failed to send on the Aquila request stream")]
    StreamClosed,

    /// The bounded outbound request queue has no remaining capacity. Callers
    /// can retry later instead of allowing queued requests to consume memory
    /// without a limit.
    #[error("Aquila request queue is full (capacity {capacity})")]
    Overloaded { capacity: usize },

    #[error("Aquila request queue capacity must be greater than zero")]
    InvalidQueueCapacity,

    #[error(
        "cannot generate a type string for data type {identifier:?}: it contains a recursive \
         schema that can't be inlined. Register the nested schema as its own data type so it \
         can be referenced by identifier instead."
    )]
    RecursiveDataType { identifier: String },

    #[error(
        "runtime function {class} has a parameter {parameter:?} that isn't declared on its runtime function"
    )]
    UnknownParameter {
        class: &'static str,
        parameter: String,
    },

    #[error("event {class} has a setting {setting:?} that isn't declared on its runtime event")]
    UnknownSetting {
        class: &'static str,
        setting: String,
    },
}

impl HerculesError {
    pub fn runtime(code: impl Into<String>, description: impl Into<Option<String>>) -> Self {
        Self::Runtime {
            code: code.into(),
            description: description.into(),
        }
    }
}

pub type Result<T, E = HerculesError> = std::result::Result<T, E>;
