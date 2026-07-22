use crate::meta::{EventMeta, RuntimeEventMeta};

/// The internal definition of an event/flow-type an action can fire.
/// Attach `#[hercules::runtime_event(identifier = "...", signature = "...")]`
/// to a (typically unit) struct to implement this via `meta()`.
///
/// Unlike [`crate::function::RuntimeFunction`], events carry no behavior —
/// firing one is just sending a payload (see [`crate::Connected::fire`]) —
/// so this trait only needs a type to hang the macro-generated `meta()` off
/// of.
pub trait RuntimeEvent: Send + Sync + 'static {
    fn meta() -> RuntimeEventMeta
    where
        Self: Sized;
}

/// A public, user-facing variant of a [`RuntimeEvent`], analogous to
/// [`crate::function::Function`] for functions.
pub trait Event: Send + Sync + 'static {
    type Base: RuntimeEvent;

    fn meta() -> EventMeta;
}
