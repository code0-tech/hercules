//! Attribute macros that replace the TS SDK's `reflect-metadata` decorators
//! (`@Identifier`, `@Signature`, `@Parameter`, ...) with compile-time code
//! generation: each macro parses its arguments and any repeated
//! `#[parameter(...)]`/`#[setting(...)]` helper attributes on the annotated
//! struct, then emits a `meta()` associated function implementing the
//! corresponding `hercules` trait. No runtime reflection, no metadata
//! registry — the definition is just a value the macro builds once, at
//! compile time.

mod data_type;
mod event;
mod function;
mod items;
mod parse;
mod runtime_event;
mod runtime_function;

use proc_macro::TokenStream;

fn run(
    f: impl FnOnce(
        proc_macro2::TokenStream,
        proc_macro2::TokenStream,
    ) -> syn::Result<proc_macro2::TokenStream>,
    attr: TokenStream,
    item: TokenStream,
) -> TokenStream {
    f(attr.into(), item.into())
        .unwrap_or_else(syn::Error::into_compile_error)
        .into()
}

/// Declares a function Aquila can invoke. See the crate-level docs on
/// `hercules::RuntimeFunction` for the full attribute grammar.
#[proc_macro_attribute]
pub fn runtime_function(attr: TokenStream, item: TokenStream) -> TokenStream {
    run(runtime_function::expand, attr, item)
}

/// Declares a public [`hercules::Function`] that overrides metadata on top
/// of a `base = SomeRuntimeFunction`.
#[proc_macro_attribute]
pub fn function(attr: TokenStream, item: TokenStream) -> TokenStream {
    run(function::expand, attr, item)
}

/// Declares a data type derived from the struct's `schemars::JsonSchema` impl.
#[proc_macro_attribute]
pub fn data_type(attr: TokenStream, item: TokenStream) -> TokenStream {
    run(data_type::expand, attr, item)
}

/// Declares an internal event/flow-type an action can fire.
#[proc_macro_attribute]
pub fn runtime_event(attr: TokenStream, item: TokenStream) -> TokenStream {
    run(runtime_event::expand, attr, item)
}

/// Declares a public [`hercules::Event`] that overrides metadata on top of a
/// `base = SomeRuntimeEvent`.
#[proc_macro_attribute]
pub fn event(attr: TokenStream, item: TokenStream) -> TokenStream {
    run(event::expand, attr, item)
}
