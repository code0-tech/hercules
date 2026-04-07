import {
    createSdk,
    HerculesActionProjectConfiguration,
    HerculesFunctionContext, Identifier, LinkedDataTypeIdentifiers,
    RuntimeErrorException, RuntimeParameter, Signature
} from "@code0-tech/hercules";

const sdk = createSdk({
    authToken: "token",
    aquilaUrl: "127.0.0.1:8081",
    actionId: "example",
    version: "0.0.0",
}, [
    {
        type: "string[]",
        identifier: "config_discord_bot_token",
    }
])

sdk.registerDataTypes({
    identifier: "SOME_DATATYPE",
    type: "any",
})

@Identifier("fib")
@Signature("(number: number) => number")
@RuntimeParameter({
    runtimeName: "number",
    defaultValue: 20
})
class FibonacciFunction {
    run(context: HerculesFunctionContext, number: number): number {
        console.log(context)
        console.log("Project id:", context.projectId);
        console.log("Execution id:", context.executionId);
        console.log("Matched configs:", context.matchedConfig); // matched configs for the current execution

        function fibonacci(num: number): number {
            if (num <= 1) return num;
            return fibonacci(num - 1) + fibonacci(num - 2);
        }

        return fibonacci(number)
    }
}

sdk.registerRuntimeFunctionDefinitionClass(FibonacciFunction)

sdk.registerFlowTypes(
    {
        signature: "(): string",
        editable: false,
        identifier: "test_flow",
    }
)


connectToSdk();

function connectToSdk() {
    sdk.connect().then((configs: HerculesActionProjectConfiguration[]) => {
        console.log("SDK connected successfully");

        sdk.dispatchEvent("test_flow", configs[0].projectId, "Hello, World! Configs loaded: " + configs.length).then(() => {
            console.log("Event dispatched successfully");
        })
    }).catch(() => {
        // will be handled by logger internally
        process.exit(1)
    })

    sdk.onError((error) => {
        console.error("SDK Error occurred:", error.message);
        console.log("Attempting to reconnect in 5s...");
        setTimeout(() => {
            connectToSdk();
        }, 5000)
    })
}
