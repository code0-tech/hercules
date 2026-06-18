import {Action, CodeZeroEvent} from "@code0-tech/hercules";
import {FibonacciRuntimeFunction} from "./functions/fibonacciRuntimeFunction.js";
import {FibonacciFunction} from "./functions/fibonacciFunction.js";
import {UserCreatedRuntimeEvent} from "./events/userCreatedRuntimeEvent.js";
import {UserCreatedEvent} from "./events/userCreatedEvent.js";
import {EmailDataType} from "./data_types/emailDataType.js";

const action = new Action(
    process.env.ACTION_ID ?? "example-action",
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

// Data type: derived from Zod schema
action.registerDataTypeClass(EmailDataType);

// Runtime flow type: the internal event definition
action.registerRuntimeEventClass(UserCreatedRuntimeEvent);

// Flow type: the user-facing event linked to the runtime flow type
action.registerEventClass(UserCreatedEvent);

action.on(CodeZeroEvent.connected, () => {
    console.log("Connected to aquila");
});

action.on(CodeZeroEvent.error, (error: Error) => {
    console.error("Stream error:", error.message);
    process.exit(0);
});


action.connect(process.env.AUTH_TOKEN ?? "token").catch((err: unknown) => {
    console.error("Failed to connect:", err);
    process.exit(1);
});
