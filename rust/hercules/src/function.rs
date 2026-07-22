use async_trait::async_trait;

use crate::arguments::Arguments;
use crate::error::Result;
use crate::meta::{FunctionMeta, RuntimeFunctionMeta};
use crate::types::{FunctionContext, PlainValue};

/// The actual behavior of a runtime function. Split out from
/// [`RuntimeFunction`] so it can be boxed as `Arc<dyn RuntimeFunctionHandler>`
/// for dynamic dispatch when an execution request comes in off the wire —
/// `RuntimeFunction::meta()` alone can't be object-safe since it's an
/// associated function with no `self`.
#[async_trait]
pub trait RuntimeFunctionHandler: Send + Sync + 'static {
    async fn run(&self, context: &FunctionContext, args: &Arguments) -> Result<PlainValue>;
}

/// A function Aquila can invoke. Implemented by attaching
/// `#[hercules::runtime_function(identifier = "...", signature = "...")]` to
/// a struct, which generates `meta()`; the struct separately implements
/// [`RuntimeFunctionHandler`] with the actual logic.
pub trait RuntimeFunction: RuntimeFunctionHandler {
    fn meta() -> RuntimeFunctionMeta
    where
        Self: Sized;
}

/// A public, user-facing variant of a [`RuntimeFunction`] — same execution
/// behavior, but its own identifier/signature/parameter defaults. It carries
/// no behavior of its own (dispatch always resolves through `Base`), only
/// metadata overrides merged onto the base via [`crate::meta::merge_function`].
pub trait Function: Send + Sync + 'static {
    type Base: RuntimeFunction;

    fn meta() -> FunctionMeta;
}
