import {createSdk, HerculesActionProjectConfiguration} from "@code0-tech/hercules";
import {FibonacciFunction} from "./fibonacciFunction";
import {someEventType} from "./exampleEventType";
import {someDataType} from "./exampleDataType";

const sdk = createSdk({
    authToken: process.env.AUTH_TOKEN || "token",
    aquilaUrl: process.env.AQUILA_URL || "127.0.0.1:8081",
    actionId: process.env.ACTION_ID || "example",
    version: process.env.VERSION || "0.0.0",
}, [
    {
        type: "string[]",
        identifier: "EXAMPLE_CONFIG_IDENTIFIER",
    }
])

sdk.registerDataTypes(someDataType)
sdk.registerRuntimeFunctionDefinitionClass(FibonacciFunction)
sdk.registerEventTypes(someEventType)


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
