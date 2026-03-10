import {createSdk} from "../src/action_sdk.js";
import {constructValue} from "@code0-tech/tucana/helpers/shared.struct_helper.js";
import {ActionProjectConfiguration} from "@code0-tech/tucana/pb/shared.action_configuration_pb.js";
import {HerculesFunctionContext} from "../src/types.js";

const sdk = createSdk({
    authToken: "someToken",
    aquilaUrl: "127.0.0.1:50051",
    actionId: "action_123",
    version: "0.0.0",
}, [
    {
        type: "LIST<STRING>",
        linkedDataTypeIdentifiers: ["STRING", "LIST"],
        identifier: "config_discord_bot_token",
    }
])

sdk.registerDataType({
    identifier: "SOME_DATATYPE",
    type: "any",
})

sdk.registerFunctionDefinition(
    {
        signature: "(n: NUMBER) => NUMBER",
        linkedDataTypeIdentifiers: ["NUMBER"],
        parameters: [
            {
                runtimeName: "n",
                defaultValue: 20,
            }
        ],
        runtimeName: "fib",
    },
    //          This param is optional and can be omitted 
    (n: number, context: HerculesFunctionContext): number => {
        console.log(context)
        console.log("Project id:", context.projectId);
        console.log("Execution id:", context.executionId);
        console.log("Matched configs:", context.matchedConfigs); // matched configs for the current execution

        function fibonacci(num: number): number {
            if (num <= 1) return num;
            return fibonacci(num - 1) + fibonacci(num - 2);
        }

        return fibonacci(n)
    }
)

sdk.registerFlowType(
    {
        editable: false,
        inputType: "STRING",
        identifier: "test_flow",
    }
)


connectToSdk();

function connectToSdk() {
    sdk.connect().then((configs: ActionProjectConfiguration[]) => {
        console.log("SDK connected successfully");
        sdk.dispatchEvent("test_flow", configs[0].projectId, constructValue("Hello, World! Configs loaded: " + configs.length)).then(() => {
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
