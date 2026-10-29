use hercules_sdk::{
    async_trait, Arguments, FunctionContext, JsonSchema, PlainValue, Result,
    RuntimeFunctionHandler, RuntimeFunctionReturn, SubFlowFunctionDefinition,
};

/// The input the returned `greet` function accepts. Declared as its own type
/// because nothing in the module definition describes a function created at
/// runtime; its `schemars` schema is sent to Aquila as the function's input
/// schema.
#[derive(JsonSchema)]
struct GreetInput {
    #[allow(dead_code)]
    name: String,
}

/// A runtime function whose handler returns another function instead of raw
/// data.
///
/// Hercules registers the returned function internally and reports it to Aquila
/// as a sub flow function, so the flow can invoke it later. Name, description
/// and the I/O schema are declared on the returned
/// [`SubFlowFunctionDefinition`] because nothing in the module definition
/// describes a function that is only created at runtime.
#[hercules_sdk::runtime_function(
    identifier = "greeter_runtime",
    signature = "(greeting: STRING): TRANSFORM<STRING, STRING>",
    name(en_US = "Greeter"),
    display_message(en_US = "Build a greeter saying ${greeting}"),
    description(en_US = "Returns a function that greets a name")
)]
#[parameter(
    runtime_name = "greeting",
    name(en_US = "Greeting"),
    description(en_US = "The greeting the returned function prefixes a name with")
)]
pub struct GreeterRuntimeFunction;

#[async_trait]
impl RuntimeFunctionHandler for GreeterRuntimeFunction {
    async fn run(
        &self,
        _context: &FunctionContext,
        args: &Arguments,
    ) -> Result<RuntimeFunctionReturn> {
        let greeting: String = args.get("greeting")?;
        let description = format!("Greets a name with \"{greeting}\"");

        let definition = SubFlowFunctionDefinition::new(
            "greet",
            move |_context: &FunctionContext, parameters: Vec<PlainValue>| -> Result<PlainValue> {
                let name = parameters
                    .first()
                    .and_then(PlainValue::as_str)
                    .unwrap_or_default();
                Ok(format!("{greeting} {name}").into())
            },
        )
        .description(description)
        .input_schema::<GreetInput>()
        .output_schema::<String>();

        Ok(definition.into())
    }
}
