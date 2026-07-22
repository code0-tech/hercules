//! Distributed registration, in the spirit of how Rocket auto-collects
//! routes: `#[hercules::runtime_function]` and friends each submit a
//! [`Registration`] via `inventory::submit!` as a side effect of the item
//! being *linked into the binary* — no explicit `action.register_*()` call
//! required.
//!
//! `RuntimeFunction`s that need constructor-injected state (a database pool,
//! an HTTP client, ...) can't be auto-constructed from nothing, so they opt
//! out with `#[hercules::runtime_function(..., manual)]` and get registered
//! explicitly via [`crate::Action::register_runtime_function`] instead.

use crate::Action;

#[doc(hidden)]
pub struct Registration(pub fn(&mut Action));

inventory::collect!(Registration);

pub(crate) fn apply_all(action: &mut Action) {
    for Registration(register) in inventory::iter::<Registration>() {
        register(action);
    }
}
