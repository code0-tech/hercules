import {Action, CodeZeroEvent} from "@code0-tech/hercules";
import {FibonacciRuntimeFunction} from "./functions/fibonacciRuntimeFunction.js";
import {FibonacciFunction} from "./functions/fibonacciFunction.js";
import {ForEachRuntimeFunction} from "./functions/forEachRuntimeFunction.js";
import {ForEachConsumersRuntimeFunction} from "./functions/forEachConsumersRuntimeFunction.js";
import {UserCreatedRuntimeEvent} from "./events/userCreatedRuntimeEvent.js";
import {EmailDataType} from "./data_types/emailDataType.js";

const action = new Action(
    process.env.ACTION_ID ?? "testing-action",
    process.env.VERSION ?? "0.0.0",
    process.env.AQUILA_URL ?? "127.0.0.1:8081",
    "code0-tech",
    "tabler:bolt",
    "A simple example action",
    [{code: "en-US", content: "Example Action"}],
    [{
        identifier: "EXAMPLE_CONFIG",
        type: "string",
        name: [{code: "en-US", content: "Example Config"}],
    }],
);

// Runtime function (with OmitRuntimeFunction — no auto-generated function def)
action.registerRuntimeFunction(FibonacciRuntimeFunction);

// Function: named public variant that extends the runtime function
action.registerFunction(FibonacciFunction);

// Runtime function that executes a sub flow parameter for each element of a list
action.registerRuntimeFunction(ForEachRuntimeFunction);

// Runtime function that takes a list of consumers (each an inline ${signature} sub flow reference)
action.registerRuntimeFunction(ForEachConsumersRuntimeFunction);

// Data type: derived from Zod schema
action.registerDataTypeClass(EmailDataType);

// Runtime flow type: the internal event definition
action.registerRuntimeEventClass(UserCreatedRuntimeEvent);


action.on(CodeZeroEvent.connected, () => {
    console.log("Connected to aquila");
});

action.on(CodeZeroEvent.error, (error: Error) => {
    console.error("Stream error:", error.message);
    console.log("Attempting to reconnect in 5s...");
    setTimeout(() => {
        action.connect(process.env.AUTH_TOKEN ?? "your_auth_token_here").catch((err: Error) => {
            action.emit(CodeZeroEvent.error, err);
        })
    }, 5000);
});

action.connect(process.env.AUTH_TOKEN ?? "your_auth_token_here").catch((err: Error) => {
    action.emit(CodeZeroEvent.error, err);
});

action.on(CodeZeroEvent.moduleUpdated, (message: any) => {
    console.dir(message, {depth: null});
    console.dir(action.configs.values(), {depth: null})
})

export {action};
