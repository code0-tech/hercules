import {
    createSdk,
    HerculesActionProjectConfiguration,
    HerculesFunctionContext,
    RuntimeErrorException
} from "@code0-tech/hercules";

const sdk = createSdk({
    authToken: "token",
    aquilaUrl: "127.0.0.1:50051",
    actionId: "service",
    version: "0.0.0",
}, [
    {
        type: "LIST<STRING>",
        linkedDataTypes: ["STRING", "LIST"],
        identifier: "config_discord_bot_token",
    }
])

sdk.registerDataTypes({
    identifier: "SOME_DATATYPE",
    type: "any",
})

sdk.registerRuntimeFunctionDefinitionsAndFunctionDefinitions({
        definition: {
            signature: "(n: NUMBER) => NUMBER",
            linkedDataTypes: ["NUMBER"],
            parameters: [
                {
                    runtimeName: "n",
                    defaultValue: 20,
                }
            ],
            runtimeName: "fib",
        },
                //This param is optional and can be omitted
        handler: (context: HerculesFunctionContext, n: number): number => {
                console.log(context)
                console.log("Project id:", context.projectId);
                console.log("Execution id:", context.executionId);
                console.log("Matched configs:", context.matchedConfig); // matched configs for the current execution

                function fibonacci(num: number): number {
                    if (num <= 1) return num;
                    return fibonacci(num - 1) + fibonacci(num - 2);
                }

                throw new RuntimeErrorException("ERROR_CALCULATING_FIB", "An error occurred while calculating the Fibonacci number.");

            }
    }
)

sdk.registerFlowTypes(
    {
        signature: "(a: TEXT): TEXT",
        linkedDataTypes: ["TEXT"],
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
    }).catch((_error) => {
        console.error("Error connecting SDK:");
    })

    sdk.onError((error) => {
        console.error("SDK Error occurred:", error.message);
        console.log("Attempting to reconnect in 5s...");
        setTimeout(() => {
            connectToSdk();
        }, 5000)
    })
}
