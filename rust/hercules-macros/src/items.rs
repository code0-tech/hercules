//! Token builders for the two repeatable child items:
//! `#[parameter(...)]` (functions) and `#[setting(...)]` (events).

use proc_macro2::TokenStream;
use quote::quote;

use crate::parse::{translation_vec, AttrArgs};

pub fn parameter_tokens(args: &AttrArgs, hercules: &TokenStream) -> syn::Result<TokenStream> {
    let runtime_name = args.required_string("runtime_name")?;
    let runtime_definition_name = match args.string("runtime_definition_name")? {
        Some(s) => quote!(Some(#s.to_string())),
        None => quote!(None),
    };
    let name = translation_vec(&args.translations("name")?, hercules);
    let description = translation_vec(&args.translations("description")?, hercules);
    let documentation = translation_vec(&args.translations("documentation")?, hercules);
    let default_value = match args.value_tokens("default_value")? {
        Some(v) => quote!(Some(#hercules::serde_json::json!(#v))),
        None => quote!(None),
    };
    let hidden = args.flag("hidden");
    let optional = args.flag("optional");

    Ok(quote! {
        #hercules::ParameterMeta {
            runtime_name: #runtime_name.to_string(),
            runtime_definition_name: #runtime_definition_name,
            name: #name,
            description: #description,
            documentation: #documentation,
            default_value: #default_value,
            hidden: #hidden,
            optional: #optional,
        }
    })
}

pub fn setting_tokens(args: &AttrArgs, hercules: &TokenStream) -> syn::Result<TokenStream> {
    let identifier = args.required_string("identifier")?;
    let unique = match args.string("unique")?.as_deref() {
        Some("project") => quote!(#hercules::UniquenessScope::Project),
        _ => quote!(#hercules::UniquenessScope::None),
    };
    let linked: Vec<String> = args.string_list("linked_data_type_identifiers")?;
    let name = translation_vec(&args.translations("name")?, hercules);
    let description = translation_vec(&args.translations("description")?, hercules);
    let default_value = match args.value_tokens("default_value")? {
        Some(v) => quote!(Some(#hercules::serde_json::json!(#v))),
        None => quote!(None),
    };
    let hidden = args.flag("hidden");
    let optional = args.flag("optional");

    Ok(quote! {
        #hercules::EventSettingMeta {
            identifier: #identifier.to_string(),
            unique: #unique,
            linked_data_type_identifiers: vec![#(#linked.to_string()),*],
            default_value: #default_value,
            name: #name,
            description: #description,
            hidden: #hidden,
            optional: #optional,
        }
    })
}
