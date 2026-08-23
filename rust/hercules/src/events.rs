use std::sync::Arc;

use tokio::sync::broadcast;
use tokio_stream::wrappers::{BroadcastStream, errors::BroadcastStreamRecvError};
use tokio_stream::{Stream, StreamExt};
use tucana::aquila::{ActionExecutionRequest, ActionFlow};
use tucana::shared::ModuleConfigurations;

use crate::error::HerculesError;

/// Application-level lifecycle events, broadcast to every subscriber (see
/// [`crate::Action::subscribe`] / [`crate::Connected::subscribe`]). Raw wire
/// traffic (every request sent, every response received) is *not* part of
/// this enum — subscribing to that would force every caller to pay for
/// cloning and routing messages they'll never look at. It's emitted via
/// `log::trace!` instead, which costs nothing when that level is disabled
/// (the common case) and needs no subscriber code to access
/// (`RUST_LOG=hercules=trace`).
#[derive(Debug, Clone)]
pub enum HerculesEvent {
    Connected,
    Error(Arc<HerculesError>),
    ModuleUpdated(Arc<ModuleConfigurations>),
    ExecutionRequestReceived(Arc<ActionExecutionRequest>),
    /// One of this action's own flows was created or updated (see
    /// [`crate::Connected::flows`]).
    FlowUpserted(Arc<ActionFlow>),
    /// One of this action's own flows was deleted; the `i64` is its `flow_id`.
    FlowDeleted(i64),
}

/// Wraps a broadcast receiver as a [`Stream`], the idiomatic way to expose a
/// multi-consumer event feed in async Rust — callers get `StreamExt`
/// combinators for free instead of hand-rolling a `recv().await` loop.
///
/// A slow subscriber can be lagged by [`crate::events`]' bounded channel;
/// rather than that terminating the stream (a `while let Ok(...) = rx.recv()`
/// loop silently stops forever on the first lag), lagged gaps are logged and
/// skipped so the stream keeps running.
pub(crate) fn event_stream(
    tx: &broadcast::Sender<HerculesEvent>,
) -> impl Stream<Item = HerculesEvent> + Send + 'static {
    BroadcastStream::new(tx.subscribe()).filter_map(|item| match item {
        Ok(event) => Some(event),
        Err(BroadcastStreamRecvError::Lagged(skipped)) => {
            log::warn!("event subscriber lagged, dropped {skipped} event(s)");
            None
        }
    })
}
