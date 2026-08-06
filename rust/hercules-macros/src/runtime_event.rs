use proc_macro2::TokenStream;
use quote::quote;
use syn::ItemStruct;

use crate::items::setting_tokens;
use crate::parse::{hercules_path, optional_string, take_repeated, translation_fields, AttrArgs};

pub fn expand(attr: TokenStream, item: TokenStream) -> syn::Result<TokenStream> {
    let mut item_struct: ItemStruct = syn::parse2(item)?;
    let args = AttrArgs::parse(attr)?;
    let hercules = hercules_path();

    let settings = take_repeated(&mut item_struct, "setting")?
        .iter()
        .map(|s| setting_tokens(s, &hercules))
        .collect::<syn::Result<Vec<_>>>()?;

    let identifier = args.required_string("identifier")?;
    let signature = args.required_string("signature")?;
    let t = translation_fields(&args, &hercules)?;
    let display_icon = optional_string(args.string("display_icon"))?;
    let editable = args.flag("editable");
    let omit_definition = args.flag("omit_definition");
    let linked: Vec<String> = args.string_list("linked_data_type_identifiers")?;
    let (name, description, documentation, display_message, alias) = (
        t.name,
        t.description,
        t.documentation,
        t.display_message,
        t.alias,
    );

    let ident = &item_struct.ident;
    Ok(quote! {
        #item_struct

        impl #hercules::RuntimeEvent for #ident {
            fn meta() -> #hercules::RuntimeEventMeta {
                #hercules::RuntimeEventMeta {
                    identifier: #identifier.to_string(),
                    signature: #signature.to_string(),
                    settings: vec![#(#settings),*],
                    editable: #editable,
                    name: #name,
                    description: #description,
                    documentation: #documentation,
                    display_message: #display_message,
                    alias: #alias,
                    display_icon: #display_icon,
                    omit_definition: #omit_definition,
                    linked_data_type_identifiers: vec![#(#linked.to_string()),*],
                }
            }
        }

        #hercules::inventory::submit! {
            #hercules::Registration(|action| {
                action.register_runtime_event::<#ident>();
            })
        }
    })
}
