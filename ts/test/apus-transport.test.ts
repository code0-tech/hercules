import {describe, expect, it, vi} from "vitest";
import type {CallContext} from "@code0-apus/apus";
import {Action} from "../src/action";
import type {FunctionContext} from "../src/types";
import type {RuntimeFunctionProps} from "../src/models/runtime_function.model";
import {buildApusFunctions} from "../src/internal/apus-transport";

function action(): Action {
    return new Action("my_action", "1.0.0", undefined, "me", "icon", "docs", []);
}

function runtimeFunction(props: Partial<RuntimeFunctionProps> & Pick<RuntimeFunctionProps, "handler">): RuntimeFunctionProps {
    return {runtimeName: "fn", signature: "(): STRING", parameters: [], ...props};
}

/** A minimal Apus CallContext stub; only `projectId`/`executionId` are read by `buildApusFunctions`. */
function callContext(overrides: Partial<CallContext> = {}): CallContext {
    return {
        executionId: "exec-1",
        projectId: 1,
        deadline: undefined,
        config: undefined,
        signal: new AbortController().signal,
        stream: () => {
            throw new Error("not used in this test");
        },
        ...overrides,
    };
}

describe("buildApusFunctions", () => {
    it("builds one handler per registered runtime function, keyed by runtime name", () => {
        const a = action();
        a.runtimeFunctions.set("a::one", runtimeFunction({handler: () => 1}));
        a.runtimeFunctions.set("a::two", runtimeFunction({handler: () => 2}));

        const functions = buildApusFunctions(a);

        expect(Object.keys(functions)).toEqual(["a::one", "a::two"]);
    });

    it("calls the 0-arity handler with no context", async () => {
        const a = action();
        a.runtimeFunctions.set("fn", runtimeFunction({parameters: [], handler: () => "hello"}));
        const functions = buildApusFunctions(a);

        await expect(functions["fn"](callContext())).resolves.toBe("hello");
    });

    it("injects a FunctionContext when the handler's arity is one more than its declared parameters", async () => {
        const a = action();
        let seen: FunctionContext | undefined;
        a.runtimeFunctions.set("fn", runtimeFunction({
            parameters: [{runtimeName: "value"}],
            handler: (ctx, value) => {
                seen = ctx as unknown as FunctionContext;
                return `got ${String(value)}`;
            },
        }));
        const functions = buildApusFunctions(a);

        const result = await functions["fn"](callContext({projectId: 42, executionId: "exec-9"}), "x");

        expect(result).toBe("got x");
        expect(seen?.projectId).toBe(42n);
        expect(seen?.executionId).toBe("exec-9");
    });

    it("passes a sub-flow argument (already a callable) straight through, unwrapped", async () => {
        const a = action();
        let seenArg: unknown;
        a.runtimeFunctions.set("fn", runtimeFunction({
            parameters: [{runtimeName: "consumer"}],
            handler: (_ctx, consumer) => {
                seenArg = consumer;
                return null;
            },
        }));
        const functions = buildApusFunctions(a);
        const consumer = (..._args: unknown[]) => Promise.resolve("sub-flow result");

        await functions["fn"](callContext(), consumer);

        expect(seenArg).toBe(consumer);
    });

    it("converts a returned sub flow function via toApusCallResult (ApusFunction, not a plain value)", async () => {
        const a = action();
        a.runtimeFunctions.set("fn", runtimeFunction({
            handler: () => ({name: "greet", description: "", inputSchema: {}, outputSchema: {}, run: () => null}),
        }));
        const functions = buildApusFunctions(a);

        const result = await functions["fn"](callContext());

        expect(a.subFlowFunctions.size).toBe(1);
        expect((result as {identifier: string}).identifier).toBeDefined();
    });

    it("FunctionContext.executeFlow routes through Action.executeFlowInProject with this call's project id", async () => {
        const a = action();
        const spy = vi.spyOn(a, "executeFlowInProject").mockResolvedValue("flow result");
        let context: FunctionContext | undefined;
        a.runtimeFunctions.set("fn", runtimeFunction({
            parameters: [{runtimeName: "value"}],
            handler: (ctx, value) => {
                context = ctx as unknown as FunctionContext;
                return String(value);
            },
        }));
        const functions = buildApusFunctions(a);

        await functions["fn"](callContext({projectId: 7}), "x");
        await context!.executeFlow(123n, {hello: "world"});

        expect(spy).toHaveBeenCalledWith(123n, 7n, {hello: "world"});
    });
});
