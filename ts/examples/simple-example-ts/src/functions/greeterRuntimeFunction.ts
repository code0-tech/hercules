import {z} from "zod";
import {
    Description,
    DisplayMessage,
    FunctionContext,
    Identifier,
    Name,
    Parameter,
    Signature,
    SubFlowFunctionDefinition,
} from "@code0-tech/hercules";

/**
 * A runtime function whose run block returns another function instead of raw data.
 *
 * Hercules registers the returned `run` internally and reports it to Aquila as a sub
 * flow function, so the flow can invoke it later. Name, description and the I/O
 * schema are declared here because nothing in the module definition describes a
 * function that is only created at runtime. The zod schemas are converted to JSON
 * schemas while the result is sent.
 */
@Identifier("greeter_runtime")
@Signature("(greeting: STRING): TRANSFORM<STRING, STRING>")
@Name({code: "en-US", content: "Greeter"})
@DisplayMessage({code: "en-US", content: "Build a greeter saying ${greeting}"})
@Parameter({
    runtimeName: "greeting",
    name: [{code: "en-US", content: "Greeting"}],
    description: [{code: "en-US", content: "The greeting the returned function prefixes a name with"}],
})
@Description({code: "en-US", content: "Returns a function that greets a name"})
export class GreeterRuntimeFunction {
    run(_context: FunctionContext, greeting: string): SubFlowFunctionDefinition {
        return {
            name: "greet",
            description: `Greets a name with "${greeting}"`,
            inputSchema: z.object({name: z.string()}),
            outputSchema: z.string(),
            run: (name) => `${greeting} ${String(name)}`,
        };
    }
}
