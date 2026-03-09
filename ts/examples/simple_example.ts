import { createSdk } from "../src/action_sdk.js";
import { Struct, Value } from "@code0-tech/tucana/pb/shared.struct_pb.js";
import { constructValue } from "@code0-tech/tucana/helpers/shared.struct_helper.js";
import { ActionProjectConfiguration } from "@code0-tech/tucana/pb/shared.action_configuration_pb.js";
import {randomUUID} from "node:crypto";

const sdk = createSdk({
    token: randomUUID(),
    actionUrl: "127.0.0.1:50051",
    actionId: "action_123",
    version: "0.0.0",
})

sdk.registerConfigDefinitions({
    type: "LIST<STRING>",
    linkedDataTypeIdentifiers: ["STRING", "LIST"],
    identifier: "config_discord_bot_token",
})

sdk.registerDataType({
    identifier: "SOME_DATATYPE",
    signature: "any",
})

sdk.registerFunctionDefinition(
    {
        signature: "(n: NUMBER) => NUMBER",
        linkedDataTypeIdentifiers: ["NUMBER"],
        runtimeParameterDefinitions: [
            {
                runtimeName: "n",
                description: [],
                name: [],
                documentation: [],
                defaultValue: constructValue(20),
            }
        ],
        version: "0.0.0",
        runtimeName: "fib",
    },
    (n: number): number => {
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
        inputTypeIdentifier: "STRING",
        identifier: "test_flow",
        version: "0.0.0",
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
