use proc_macro2::{Span, TokenStream};
use quote::quote;
use syn::ItemStruct;

use crate::items::parameter_tokens;
use crate::parse::{
    hercules_path, optional_string, optional_translation_vec, take_repeated, AttrArgs,
};

pub fn expand(attr: TokenStream, item: TokenStream) -> syn::Result<TokenStream> {
    let mut item_struct: ItemStruct = syn::parse2(item)?;
    let args = AttrArgs::parse(attr)?;
    let hercules = hercules_path();

    let base = args.path("base")?.ok_or_else(|| {
        syn::Error::new(
            Span::call_site(),
            "missing required `base = SomeRuntimeFunction`",
        )
    })?;

    let parameters = take_repeated(&mut item_struct, "parameter")?
        .iter()
        .map(|p| parameter_tokens(p, &hercules))
        .collect::<syn::Result<Vec<_>>>()?;

    let identifier = optional_string(args.string("identifier"))?;
    let signature = optional_string(args.string("signature"))?;
    let name = optional_translation_vec(&args, "name", &hercules)?;
    let description = optional_translation_vec(&args, "description", &hercules)?;
    let documentation = optional_translation_vec(&args, "documentation", &hercules)?;
    let deprecation_message = optional_translation_vec(&args, "deprecation_message", &hercules)?;
    let display_message = optional_translation_vec(&args, "display_message", &hercules)?;
    let alias = optional_translation_vec(&args, "alias", &hercules)?;
    let display_icon = optional_string(args.string("display_icon"))?;
    let design = optional_string(args.string("design"))?;
    // Presence-only: this overrides `throws_error` to `true`; to leave it
    // unset (inherit the base), simply omit the flag.
    let throws_error = if args.flag("throws_error") {
        quote!(Some(true))
    } else {
        quote!(None)
    };

    let ident = &item_struct.ident;
    Ok(quote! {
        #item_struct

        impl #hercules::Function for #ident {
            type Base = #base;

            fn meta() -> #hercules::FunctionMeta {
                #hercules::FunctionMeta {
                    identifier: #identifier,
                    signature: #signature,
                    name: #name,
                    description: #description,
                    documentation: #documentation,
                    deprecation_message: #deprecation_message,
                    display_message: #display_message,
                    alias: #alias,
                    display_icon: #display_icon,
                    design: #design,
                    throws_error: #throws_error,
                    parameters: vec![#(#parameters),*],
                }
            }
        }

        // `Function` carries no instance/state (dispatch always resolves
        // through `Base`), so unlike `runtime_function` this needs no
        // `manual` escape hatch — it's always safe to auto-register.
        #hercules::inventory::submit! {
            #hercules::Registration(|action| {
                action.register_function::<#ident>()
                    .unwrap_or_else(|e| panic!("failed to register function {}: {e}", stringify!(#ident)));
            })
        }
    })
}
