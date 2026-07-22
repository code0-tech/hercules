use proc_macro2::{Span, TokenStream};
use quote::quote;
use syn::ItemStruct;

use crate::items::setting_tokens;
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
            "missing required `base = SomeRuntimeEvent`",
        )
    })?;

    let settings = take_repeated(&mut item_struct, "setting")?
        .iter()
        .map(|s| setting_tokens(s, &hercules))
        .collect::<syn::Result<Vec<_>>>()?;

    let identifier = optional_string(args.string("identifier"))?;
    let signature = optional_string(args.string("signature"))?;
    let name = optional_translation_vec(&args, "name", &hercules)?;
    let description = optional_translation_vec(&args, "description", &hercules)?;
    let documentation = optional_translation_vec(&args, "documentation", &hercules)?;
    let display_message = optional_translation_vec(&args, "display_message", &hercules)?;
    let alias = optional_translation_vec(&args, "alias", &hercules)?;
    let display_icon = optional_string(args.string("display_icon"))?;
    let editable = if args.flag("editable") {
        quote!(Some(true))
    } else {
        quote!(None)
    };

    let ident = &item_struct.ident;
    Ok(quote! {
        #item_struct

        impl #hercules::Event for #ident {
            type Base = #base;

            fn meta() -> #hercules::EventMeta {
                #hercules::EventMeta {
                    identifier: #identifier,
                    signature: #signature,
                    settings: vec![#(#settings),*],
                    editable: #editable,
                    name: #name,
                    description: #description,
                    documentation: #documentation,
                    display_message: #display_message,
                    alias: #alias,
                    display_icon: #display_icon,
                }
            }
        }

        #hercules::inventory::submit! {
            #hercules::Registration(|action| {
                action.register_event::<#ident>()
                    .unwrap_or_else(|e| panic!("failed to register event {}: {e}", stringify!(#ident)));
            })
        }
    })
}
