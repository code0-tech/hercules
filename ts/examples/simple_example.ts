import { createSdk } from "../src/action_sdk.js";
import { Struct, Value } from "@code0-tech/tucana/pb/shared.struct_pb.js";
import { constructValue } from "@code0-tech/tucana/helpers/shared.struct_helper.js";
import { ActionProjectConfiguration } from "@code0-tech/tucana/pb/shared.action_configuration_pb.js";

const sdk = createSdk({
    token: "your_token_here",
    actionUrl: "127.0.0.1:50051",
    actionId: "action_123",
    version: "0.0.0",
})

sdk.registerConfigDefinitions({
    type: {
        signature: "string",
        identifier: "STRING",
        version: "0.0.0",
        rules: [],
        name: [],
        genericKeys: [],
        alias: [],
        displayMessage: [],
        linkedDataTypeIdentifiers: [],
        definitionSource: ""
    },
    name: [],
    description: [],
    identifier: "config_discord_bot_token",
})

sdk.registerDataType({
    identifier: "SOME_DATATYPE",
    signature: "any",
    name: [],
    alias: [],
    rules: [],
    genericKeys: [],
    displayMessage: [],
    definitionSource: "",
    linkedDataTypeIdentifiers: [],
    version: "0.0.0",
})

sdk.registerFunctionDefinition(
    {
        signature: "(n: NUMBER) => NUMBER",
        definitionSource: "",
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
        alias: [],
        deprecationMessage: [],
        description: [],
        displayIcon: "",
        displayMessage: [],
        documentation: [],
        name: [],
        throwsError: false,
        version: "0.0.0",
        runtimeName: "fib",
    },
    async (params: Struct): Promise<Value> => {
        console.log("Received parameters:", params);
        let n = params.fields["n"];

        function fibonacci(num: number): number {
            if (num <= 1) return num;
            return fibonacci(num - 1) + fibonacci(num - 2);
        }

        if (n && n.kind.oneofKind === "numberValue") {
            return constructValue(fibonacci(n.kind.numberValue));
        }

        return constructValue(fibonacci(1));
    }
)

sdk.registerFlowType(
    {
        documentation: [],
        description: [],
        displayIcon: "",
        displayMessage: [],
        editable: false,
        inputTypeIdentifier: "STRING",
        name: [],
        alias: [],
        identifier: "test_flow",
        settings: [],
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