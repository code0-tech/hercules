//! Shared parsing for the `#[hercules_sdk::...]` attribute macros' argument
//! lists (`identifier = "...", name(en_US = "...")`) and for the repeatable
//! helper attributes (`#[parameter(...)]`, `#[setting(...)]`) they read off
//! a struct and strip before re-emitting it.

use proc_macro2::TokenStream;
use quote::quote;
use syn::parse::Parser;
use syn::punctuated::Punctuated;
use syn::{Attribute, Expr, ExprLit, ItemStruct, Lit, Meta, MetaNameValue, Token};

pub struct AttrArgs {
    metas: Vec<Meta>,
}

fn expr_str(expr: &Expr) -> syn::Result<String> {
    match expr {
        Expr::Lit(ExprLit {
            lit: Lit::Str(s), ..
        }) => Ok(s.value()),
        other => Err(syn::Error::new_spanned(other, "expected a string literal")),
    }
}

impl AttrArgs {
    pub fn parse(tokens: TokenStream) -> syn::Result<Self> {
        let metas = Punctuated::<Meta, Token![,]>::parse_terminated.parse2(tokens)?;
        Ok(Self {
            metas: metas.into_iter().collect(),
        })
    }

    fn find(&self, key: &str) -> Option<&Meta> {
        self.metas.iter().find(|m| m.path().is_ident(key))
    }

    /// `key = "..."`.
    pub fn string(&self, key: &str) -> syn::Result<Option<String>> {
        match self.find(key) {
            None => Ok(None),
            Some(Meta::NameValue(MetaNameValue { value, .. })) => Ok(Some(expr_str(value)?)),
            Some(other) => Err(syn::Error::new_spanned(
                other,
                format!("expected `{key} = \"...\"`"),
            )),
        }
    }

    /// A required `key = "..."`.
    pub fn required_string(&self, key: &str) -> syn::Result<String> {
        self.string(key)?.ok_or_else(|| {
            syn::Error::new(
                proc_macro2::Span::call_site(),
                format!("missing required `{key} = \"...\"`"),
            )
        })
    }

    /// `key` present as a bare flag, e.g. `omit_definition`.
    pub fn flag(&self, key: &str) -> bool {
        matches!(self.find(key), Some(Meta::Path(_)))
    }

    /// `key = SomeIdent` — used for `base = MyRuntimeFunction`.
    pub fn path(&self, key: &str) -> syn::Result<Option<syn::Path>> {
        match self.find(key) {
            None => Ok(None),
            Some(Meta::NameValue(MetaNameValue {
                value: Expr::Path(p),
                ..
            })) => Ok(Some(p.path.clone())),
            Some(other) => Err(syn::Error::new_spanned(
                other,
                format!("expected `{key} = SomeType`"),
            )),
        }
    }

    /// `key(en_US = "...", de_DE = "...")`, returning `(locale, content)`
    /// pairs. Underscores in the locale identifier become hyphens
    /// (`en_US` -> `en-US`) since Rust identifiers can't contain them.
    pub fn translations(&self, key: &str) -> syn::Result<Vec<(String, String)>> {
        let Some(Meta::List(list)) = self.find(key) else {
            return Ok(vec![]);
        };
        let entries =
            list.parse_args_with(Punctuated::<MetaNameValue, Token![,]>::parse_terminated)?;
        entries
            .into_iter()
            .map(|nv| {
                let code = nv
                    .path
                    .get_ident()
                    .ok_or_else(|| {
                        syn::Error::new_spanned(
                            &nv.path,
                            "expected a locale identifier, e.g. en_US",
                        )
                    })?
                    .to_string()
                    .replace('_', "-");
                Ok((code, expr_str(&nv.value)?))
            })
            .collect()
    }

    /// `key("a", "b")`.
    pub fn string_list(&self, key: &str) -> syn::Result<Vec<String>> {
        let Some(Meta::List(list)) = self.find(key) else {
            return Ok(vec![]);
        };
        let entries =
            list.parse_args_with(Punctuated::<syn::LitStr, Token![,]>::parse_terminated)?;
        Ok(entries.into_iter().map(|s| s.value()).collect())
    }

    /// A literal value for `default_value = <lit>`, kept as raw tokens so
    /// the caller can splice it into `serde_json::json!(...)`.
    pub fn value_tokens(&self, key: &str) -> syn::Result<Option<TokenStream>> {
        match self.find(key) {
            None => Ok(None),
            Some(Meta::NameValue(MetaNameValue { value, .. })) => Ok(Some(quote!(#value))),
            Some(other) => Err(syn::Error::new_spanned(
                other,
                format!("expected `{key} = <value>`"),
            )),
        }
    }
}

/// Extracts and removes every `#[name(...)]` attribute on `item`, in source
/// order, parsing each occurrence's arguments as [`AttrArgs`]. This is how
/// `#[parameter(...)]`/`#[setting(...)]` can appear multiple times on one
/// struct: rustc never resolves them as real attributes because the outer
/// `#[hercules_sdk::...]` macro (which runs first) strips them before
/// re-emitting the struct.
pub fn take_repeated(item: &mut ItemStruct, name: &str) -> syn::Result<Vec<AttrArgs>> {
    let mut found = Vec::new();
    let mut error = None;
    item.attrs.retain(|attr: &Attribute| {
        if !attr.path().is_ident(name) {
            return true;
        }
        match attr.parse_args_with(Punctuated::<Meta, Token![,]>::parse_terminated) {
            Ok(metas) => found.push(AttrArgs {
                metas: metas.into_iter().collect(),
            }),
            Err(e) => {
                error.get_or_insert(e);
            }
        }
        false
    });
    match error {
        Some(e) => Err(e),
        None => Ok(found),
    }
}

/// `key1: T1, key2: T2, ...` boilerplate for the handful of translation
/// fields every meta struct shares.
pub fn translation_fields(
    args: &AttrArgs,
    hercules: &TokenStream,
) -> syn::Result<TranslationFields> {
    Ok(TranslationFields {
        name: translation_vec(&args.translations("name")?, hercules),
        description: translation_vec(&args.translations("description")?, hercules),
        documentation: translation_vec(&args.translations("documentation")?, hercules),
        deprecation_message: translation_vec(&args.translations("deprecation_message")?, hercules),
        display_message: translation_vec(&args.translations("display_message")?, hercules),
        alias: translation_vec(&args.translations("alias")?, hercules),
    })
}

pub struct TranslationFields {
    pub name: TokenStream,
    pub description: TokenStream,
    pub documentation: TokenStream,
    pub deprecation_message: TokenStream,
    pub display_message: TokenStream,
    pub alias: TokenStream,
}

pub fn translation_vec(entries: &[(String, String)], hercules: &TokenStream) -> TokenStream {
    let items = entries
        .iter()
        .map(|(code, content)| quote!(#hercules::Translation::new(#code, #content)));
    quote!(vec![#(#items),*])
}

pub fn optional_translation_vec(
    args: &AttrArgs,
    key: &str,
    hercules: &TokenStream,
) -> syn::Result<TokenStream> {
    let entries = args.translations(key)?;
    if entries.is_empty() {
        return Ok(quote!(None));
    }
    let vec = translation_vec(&entries, hercules);
    Ok(quote!(Some(#vec)))
}

pub fn optional_string(value: syn::Result<Option<String>>) -> syn::Result<TokenStream> {
    Ok(match value? {
        Some(s) => quote!(Some(#s.to_string())),
        None => quote!(None),
    })
}

pub fn hercules_path() -> TokenStream {
    quote!(::hercules_sdk)
}
