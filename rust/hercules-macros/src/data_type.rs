use proc_macro2::TokenStream;
use quote::quote;
use syn::ItemStruct;

use crate::parse::{AttrArgs, hercules_path, optional_string, translation_vec};

pub fn expand(attr: TokenStream, item: TokenStream) -> syn::Result<TokenStream> {
    let item_struct: ItemStruct = syn::parse2(item)?;
    let args = AttrArgs::parse(attr)?;
    let hercules = hercules_path();

    let identifier = args.required_string("identifier")?;
    let name = translation_vec(&args.translations("name")?, &hercules);
    let display_message = translation_vec(&args.translations("display_message")?, &hercules);
    let alias = translation_vec(&args.translations("alias")?, &hercules);
    let generic_keys: Vec<String> = args.string_list("generic_keys")?;
    let type_override = optional_string(args.string("type_override"))?;
    let linked: Vec<String> = args.string_list("linked_data_type_identifiers")?;

    let ident = &item_struct.ident;
    Ok(quote! {
        #item_struct

        impl #hercules::DataType for #ident {
            fn meta() -> #hercules::DataTypeMeta {
                #hercules::DataTypeMeta {
                    identifier: #identifier.to_string(),
                    name: #name,
                    display_message: #display_message,
                    alias: #alias,
                    generic_keys: vec![#(#generic_keys.to_string()),*],
                    type_override: #type_override,
                    linked_data_type_identifiers: vec![#(#linked.to_string()),*],
                }
            }
        }

        #hercules::inventory::submit! {
            #hercules::Registration(|action| {
                action.register_data_type::<#ident>()
                    .unwrap_or_else(|e| panic!("failed to register data type {}: {e}", stringify!(#ident)));
            })
        }
    })
}
