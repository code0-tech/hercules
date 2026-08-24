use proc_macro2::TokenStream;
use quote::quote;
use syn::{Fields, ItemStruct};

use crate::items::parameter_tokens;
use crate::parse::{AttrArgs, hercules_path, optional_string, take_repeated, translation_fields};

pub fn expand(attr: TokenStream, item: TokenStream) -> syn::Result<TokenStream> {
    let mut item_struct: ItemStruct = syn::parse2(item)?;
    let args = AttrArgs::parse(attr)?;
    let hercules = hercules_path();

    let parameters = take_repeated(&mut item_struct, "parameter")?
        .iter()
        .map(|p| parameter_tokens(p, &hercules))
        .collect::<syn::Result<Vec<_>>>()?;

    let identifier = args.required_string("identifier")?;
    let signature = args.required_string("signature")?;
    let t = translation_fields(&args, &hercules)?;
    let display_icon = optional_string(args.string("display_icon"))?;
    let design = optional_string(args.string("design"))?;
    let throws_error = args.flag("throws_error");
    let omit_definition = args.flag("omit_definition");
    let linked: Vec<String> = args.string_list("linked_data_type_identifiers")?;
    let (name, description, documentation, deprecation_message, display_message, alias) = (
        t.name,
        t.description,
        t.documentation,
        t.deprecation_message,
        t.display_message,
        t.alias,
    );

    let ident = &item_struct.ident;
    let meta_impl = quote! {
        impl #hercules::RuntimeFunction for #ident {
            fn meta() -> #hercules::RuntimeFunctionMeta {
                #hercules::RuntimeFunctionMeta {
                    identifier: #identifier.to_string(),
                    signature: #signature.to_string(),
                    name: #name,
                    description: #description,
                    documentation: #documentation,
                    deprecation_message: #deprecation_message,
                    display_message: #display_message,
                    alias: #alias,
                    display_icon: #display_icon,
                    design: #design,
                    throws_error: #throws_error,
                    omit_definition: #omit_definition,
                    parameters: vec![#(#parameters),*],
                    linked_data_type_identifiers: vec![#(#linked.to_string()),*],
                }
            }
        }
    };

    // `manual`: this handler needs constructor-injected state a macro has no
    // way to conjure up (a DB pool, a client, ...) — register it yourself
    // via `Action::register_runtime_function(instance)` instead.
    if args.flag("manual") {
        return Ok(quote! {
            #item_struct
            #meta_impl
        });
    }

    // A unit struct has no fields to default-construct, so the common case
    // (stateless handlers, by far most of them) gets `Default` for free
    // instead of requiring `#[derive(Default)]` on every single one.
    let default_impl = matches!(item_struct.fields, Fields::Unit).then(|| {
        quote! {
            impl ::core::default::Default for #ident {
                fn default() -> Self {
                    #ident
                }
            }
        }
    });

    Ok(quote! {
        #item_struct
        #meta_impl
        #default_impl

        #hercules::inventory::submit! {
            #hercules::Registration(|action| {
                action.register_runtime_function(<#ident as ::core::default::Default>::default());
            })
        }
    })
}
