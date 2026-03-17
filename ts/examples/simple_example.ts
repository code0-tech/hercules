import {createSdk, HerculesActionProjectConfiguration, RuntimeErrorException} from "../src/action_sdk.js";
import {constructValue} from "@code0-tech/tucana/helpers/shared.struct_helper.js";
import {ActionProjectConfiguration} from "@code0-tech/tucana/pb/shared.action_configuration_pb.js";
import {HerculesFunctionContext} from "../src/types.js";
import {PlainValue} from "@code0-tech/tucana/helpers/shared.struct_helper";

const sdk = createSdk({
    authToken: "someToken",
    aquilaUrl: "127.0.0.1:50051",
    actionId: "action_123",
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

sdk.registerFunctionDefinitions(
    [{
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
        (context: HerculesFunctionContext, n: number): number => {
            console.log(context)
            console.log("Project id:", context.projectId);
            console.log("Execution id:", context.executionId);
            console.log("Matched configs:", context.matchedConfig); // matched configs for the current execution

            function fibonacci(num: number): number {
                if (num <= 1) return num;
                return fibonacci(num - 1) + fibonacci(num - 2);
            }

            throw new RuntimeErrorException("ERROR_CALCULATING_FIB", "An error occurred while calculating the Fibonacci number.");

        }]
)

sdk.registerFlowTypes(
    {
        editable: false,
        inputType: "STRING",
        identifier: "test_flow",
    }
)


connectToSdk();

function connectToSdk() {
    sdk.connect().then((configs: HerculesActionProjectConfiguration[]) => {
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
