//! Renders a built [`tucana::shared::Module`] as a directory of JSON files —
//! `meta.json` plus one file per data type / flow type / runtime flow type /
//! function / runtime function — using the same field names and camelCase
//! wire format Aquila accepts, since each wire type's `Serialize` impl
//! already implements protobuf's canonical JSON mapping.

use std::fs;
use std::io;
use std::path::Path;

use serde::Serialize;
use tucana::shared::{Module, Translation};

pub(crate) fn write(module: &Module, dir: &Path) -> io::Result<()> {
    fs::create_dir_all(dir)?;
    write_json(&dir.join("meta.json"), &Meta::from(module))?;

    write_each(
        &dir.join("data_types"),
        &module.definition_data_types,
        |dt| &dt.identifier,
    )?;
    write_each(&dir.join("flow_types"), &module.flow_types, |ft| {
        &ft.identifier
    })?;
    write_each(
        &dir.join("runtime_flow_types"),
        &module.runtime_flow_types,
        |rft| &rft.identifier,
    )?;
    write_each(&dir.join("functions"), &module.function_definitions, |f| {
        &f.runtime_name
    })?;
    write_each(
        &dir.join("runtime_functions"),
        &module.runtime_function_definitions,
        |f| &f.runtime_name,
    )?;

    Ok(())
}

#[derive(Serialize)]
struct Meta<'a> {
    identifier: &'a str,
    name: &'a [Translation],
    description: &'a [Translation],
    documentation: &'a str,
    author: &'a str,
    icon: &'a str,
    version: &'a str,
}

impl<'a> From<&'a Module> for Meta<'a> {
    fn from(module: &'a Module) -> Self {
        Self {
            identifier: &module.identifier,
            name: &module.name,
            description: &module.description,
            documentation: &module.documentation,
            author: &module.author,
            icon: &module.icon,
            version: &module.version,
        }
    }
}

// Every definition carries these two fields, but they're the same for
// every item in the module (the module's own version, and always
// "action") rather than anything distinguishing about the item itself,
// so they're dropped from the exported files as noise.
const OMITTED_FIELDS: [&str; 2] = ["version", "definitionSource"];

fn write_each<T: Serialize>(
    dir: &Path,
    items: &[T],
    identifier: impl Fn(&T) -> &str,
) -> io::Result<()> {
    if items.is_empty() {
        return Ok(());
    }
    fs::create_dir_all(dir)?;
    for item in items {
        let mut value = serde_json::to_value(item)
            .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
        if let Some(object) = value.as_object_mut() {
            for field in OMITTED_FIELDS {
                object.remove(field);
            }
        }
        write_json(&dir.join(format!("{}.json", identifier(item))), &value)?;
    }
    Ok(())
}

fn write_json<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    let json = serde_json::to_string_pretty(value)
        .map_err(|err| io::Error::new(io::ErrorKind::InvalidData, err))?;
    fs::write(path, json)
}

#[cfg(test)]
mod tests {
    use tucana::shared::{DefinitionDataType, Module, RuntimeFlowType, Translation};

    use super::write;

    fn sample_module() -> Module {
        Module {
            identifier: "example-action".into(),
            version: "0.1.0".into(),
            author: "code0-tech".into(),
            icon: "tabler:bolt".into(),
            documentation: "An example".into(),
            name: vec![Translation {
                code: "en-US".into(),
                content: "Example".into(),
            }],
            definition_data_types: vec![DefinitionDataType {
                identifier: "EMAIL".into(),
                r#type: "string".into(),
                version: "0.1.0".into(),
                ..Default::default()
            }],
            runtime_flow_types: vec![RuntimeFlowType {
                identifier: "CRON".into(),
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    #[test]
    fn writes_one_file_per_definition_plus_meta() {
        let dir = std::env::temp_dir().join(format!("hercules-export-test-{}", std::process::id()));
        write(&sample_module(), &dir).expect("export succeeds");

        let meta: serde_json::Value =
            serde_json::from_slice(&std::fs::read(dir.join("meta.json")).unwrap()).unwrap();
        assert_eq!(meta["identifier"], "example-action");

        let email: serde_json::Value = serde_json::from_slice(
            &std::fs::read(dir.join("data_types").join("EMAIL.json")).unwrap(),
        )
        .unwrap();
        assert_eq!(email["identifier"], "EMAIL");

        assert!(dir.join("runtime_flow_types").join("CRON.json").exists());
        // No functions/flow types were registered, so those directories
        // shouldn't be created at all.
        assert!(!dir.join("functions").exists());
        assert!(!dir.join("flow_types").exists());

        std::fs::remove_dir_all(&dir).ok();
    }
}
