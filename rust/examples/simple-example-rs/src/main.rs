mod data_types;
mod events;
mod functions;

use hercules::{Action, ConfigurationDefinition, HerculesEvent, Translation};
use tokio_stream::StreamExt;

fn env(key: &str, default: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| default.to_string())
}

/// `FibonacciRuntimeFunction`, `FibonacciFunction`, `EmailAddress` and
/// `UserCreatedRuntimeEvent` never appear below — attaching
/// `#[hercules::runtime_function]` / `function` / `data_type` /
/// `runtime_event` registered each of them automatically as part of
/// `Action::new` (see `hercules::registration`). There's simply nothing left
/// to wire up by hand for this example.
fn build_action() -> Action {
    Action::new(env("ACTION_ID", "example-action"), env("VERSION", "0.0.0"))
        .aquila_url(env("AQUILA_URL", "127.0.0.1:8081"))
        .author("code0-tech")
        .icon("tabler:bolt")
        .documentation("A simple example action")
        .name([Translation::new("en-US", "Example Action")])
        .configuration(
            ConfigurationDefinition::new("EXAMPLE_CONFIG", "string")
                .name([Translation::new("en-US", "Example Config")]),
        )
}

#[tokio::main]
async fn main() -> hercules::Result<()> {
    // RUST_LOG=hercules=debug,simple_example_rs=debug cargo run
    env_logger::init();

    let action = build_action();
    let mut events = action.subscribe();

    // The returned `Connected` handle can be discarded immediately: the
    // background dispatch task (started inside `connect`) holds its own
    // `Arc` to the shared connection state, so nothing here needs to keep
    // it alive.
    action
        .connect(env("AUTH_TOKEN", "token"), None)
        .await
        .unwrap_or_else(|err| panic!("failed to connect to Aquila: {err}"));

    // React to connection lifecycle events on the main task for as long as
    // the process runs. Panicking here (unlike inside a spawned task) takes
    // the whole process down on an unrecoverable stream error.
    while let Some(event) = events.next().await {
        match event {
            HerculesEvent::Connected => log::info!("connected to Aquila"),
            HerculesEvent::Error(error) => panic!("Aquila stream error: {error}"),
            _ => {}
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use hercules::wire::Module;

    use super::build_action;

    /// Exercises the real registration path end to end — link-time
    /// `inventory` auto-registration, `Function`/`RuntimeFunction` merging,
    /// and `schemars`-driven data type resolution — by building the wire
    /// `Module` without connecting.
    #[test]
    fn builds_a_well_formed_module() {
        let module: Module = build_action().build_module();

        assert_eq!(module.identifier, "example-action");

        let email = module
            .definition_data_types
            .iter()
            .find(|dt| dt.identifier == "email_address")
            .expect("email_address data type");
        assert_eq!(email.r#type, "string");
        assert!(matches!(
            email.rules.first().and_then(|r| r.config.clone()),
            Some(tucana::shared::definition_data_type_rule::Config::Regex(_))
        ));

        let fibonacci = module
            .function_definitions
            .iter()
            .find(|f| f.runtime_name == "fibonacci")
            .expect("fibonacci function");
        assert_eq!(fibonacci.runtime_definition_name, "fibonacci_runtime");
        let param = &fibonacci.parameter_definitions[0];
        assert_eq!(param.runtime_name, "test");
        assert_eq!(
            param.default_value.as_ref().and_then(|v| v.kind.clone()),
            Some(tucana::shared::value::Kind::NumberValue(
                tucana::shared::NumberValue {
                    number: Some(tucana::shared::number_value::Number::Integer(10))
                }
            ))
        );

        // omit_definition on the runtime function means it isn't separately
        // published under its own identifier.
        assert!(module
            .function_definitions
            .iter()
            .all(|f| f.runtime_name != "fibonacci_runtime"));
        assert_eq!(
            module.runtime_function_definitions[0].runtime_name,
            "fibonacci_runtime"
        );

        assert_eq!(module.runtime_flow_types[0].identifier, "user_created");
    }
}
