import "reflect-metadata";
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {z} from "zod";
import type {ActionExecutionRequest, ActionTransferRequest} from "@code0-tech/tucana/aquila";
import type {Value} from "@code0-tech/tucana/shared";
import {Action} from "../src/action";
import {SUB_FLOW_FUNCTION_TTL_MS} from "../src/manager/SubFlowFunctionManager";
import {handle} from "../src/actions/Execution";
import type {RuntimeFunctionProps} from "../src/models/runtime_function.model";
import type {SubFlow, SubFlowFunctionDefinition} from "../src/types";

const str = (stringValue: string): Value => ({kind: {oneofKind: "stringValue", stringValue}});
const list = (...values: Value[]): Value => ({kind: {oneofKind: "listValue", listValue: {values}}});
const struct = (fields: Record<string, Value>): Value => ({kind: {oneofKind: "structValue", structValue: {fields}}});

const literalParam = (value: Value) => ({value: {oneofKind: "literalValue" as const, literalValue: {value, references: []}}});

const subFlowParam = (subFlow: {executionIdentifier: string; name?: string; description?: string}) =>
    ({value: {oneofKind: "subFlow" as const, subFlow}});

function runtimeFunction(props: Partial<RuntimeFunctionProps> & Pick<RuntimeFunctionProps, "handler">): RuntimeFunctionProps {
    return {runtimeName: "fn", signature: "(): STRING", parameters: [], ...props};
}

/** An action with a stubbed stream that records everything it would send to Aquila. */
function stubAction(): {action: Action; sent: ActionTransferRequest[]} {
    const action = new Action("my_action", "1.0.0", undefined, "me", "icon", "docs", []);
    const sent: ActionTransferRequest[] = [];
    (action as unknown as {_stream: unknown})._stream = {
        requests: {send: (request: ActionTransferRequest) => (sent.push(request), Promise.resolve())},
    };
    return {action, sent};
}

const request = (functionIdentifier: string, parameters: ActionExecutionRequest["parameters"] = []): ActionExecutionRequest => ({
    executionIdentifier: "exec-1",
    functionIdentifier,
    parameters,
    projectId: 1n,
});

/** The NodeValueExecutionResult of the single result the action sent. */
function sentResult(sent: ActionTransferRequest[]) {
    expect(sent).toHaveLength(1);
    const {data} = sent[0];
    if (data.oneofKind !== "result") throw new Error(`expected a result, got ${data.oneofKind}`);
    const {result} = data.result.nodeResult!;
    if (result.oneofKind !== "success") throw new Error(`expected a success, got ${result.oneofKind}`);
    return result.success.value;
}

/** The ProtoError of the single error result the action sent. */
function sentError(sent: ActionTransferRequest[]) {
    expect(sent).toHaveLength(1);
    const {data} = sent[0];
    if (data.oneofKind !== "result") throw new Error(`expected a result, got ${data.oneofKind}`);
    const {result} = data.result.nodeResult!;
    if (result.oneofKind !== "error") throw new Error(`expected an error, got ${result.oneofKind}`);
    return result.error;
}

const subFlowFunction = (run: SubFlowFunctionDefinition["run"]): SubFlowFunctionDefinition => ({
    name: "greet",
    description: "Greets someone",
    inputSchema: z.object({name: z.string()}),
    outputSchema: z.string(),
    run,
});

describe("executing a flow", () => {
    let action: Action;
    let sent: ActionTransferRequest[];

    beforeEach(() => ({action, sent} = stubAction()));

    /** The flow execution the action sent. */
    function sentFlowExecution(index = 0) {
        const {data} = sent[index];
        if (data.oneofKind !== "flowExecution") throw new Error(`expected a flow execution, got ${data.oneofKind}`);
        return data.flowExecution;
    }

    it("reserves an execution id per run", () => {
        const first = action.reserveExecutionId();

        expect(first).not.toEqual(action.reserveExecutionId());
        expect(first).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("starts a flow under the id it was given, so a node can be matched to this run", async () => {
        const executionId = action.reserveExecutionId();

        const result = action.executeFlowWithId(executionId, 7n, {hello: "world"});
        await new Promise(resolve => setImmediate(resolve));

        expect(sentFlowExecution().executionIdentifier).toEqual(executionId);
        expect(sentFlowExecution().flowId).toEqual("7");

        // The very id a runtime function of the flow reports as its execution id.
        action.resolveExecutionResponse(executionId, {oneofKind: "success", success: str("done")});
        await expect(result).resolves.toEqual("done");
    });

    it("reserves its own id when none was given", async () => {
        const result = action.executeFlow(7);
        await new Promise(resolve => setImmediate(resolve));
        const {executionIdentifier} = sentFlowExecution();

        expect(executionIdentifier).toMatch(/^[0-9a-f-]{36}$/);
        action.resolveExecutionResponse(executionIdentifier, {oneofKind: "success", success: str("done")});
        await expect(result).resolves.toEqual("done");
    });

    it("keeps two runs of one flow apart", async () => {
        const [first, second] = [action.reserveExecutionId(), action.reserveExecutionId()];

        const runs = Promise.all([action.executeFlowWithId(first, 7n), action.executeFlowWithId(second, 7n)]);
        await new Promise(resolve => setImmediate(resolve));

        // Answered out of order, which is what the identifiers are for.
        action.resolveExecutionResponse(second, {oneofKind: "success", success: str("second")});
        action.resolveExecutionResponse(first, {oneofKind: "success", success: str("first")});
        await expect(runs).resolves.toEqual(["first", "second"]);
    });

    it("needs a connection", async () => {
        const offline = new Action("my_action", "1.0.0", undefined, "me", "icon", "docs", []);

        await expect(offline.executeFlowWithId("exec-1", 7n)).rejects.toThrow(/Not connected/);
    });
});

describe("execution results", () => {
    let action: Action;
    let sent: ActionTransferRequest[];

    beforeEach(() => ({action, sent} = stubAction()));

    it("reports raw data as a raw value", async () => {
        action.runtimeFunctions.set("fn", runtimeFunction({handler: () => "hello"}));

        handle(action, request("fn"));
        await new Promise(resolve => setImmediate(resolve));

        expect(sentResult(sent)).toEqual({oneofKind: "rawValue", rawValue: str("hello")});
    });

    it("registers a returned sub flow function and reports it as a sub flow function result", async () => {
        action.runtimeFunctions.set("fn", runtimeFunction({handler: () => subFlowFunction(name => `Hi ${name}`)}));

        handle(action, request("fn"));
        await new Promise(resolve => setImmediate(resolve));

        const value = sentResult(sent);
        if (value.oneofKind !== "subFlowFunctionResult") throw new Error("expected a sub flow function result");
        const result = value.subFlowFunctionResult;

        expect(result.name).toBe("greet");
        expect(result.description).toBe("Greets someone");
        // The zod schemas are converted to JSON schemas before they are sent. The
        // input schema describes what the function accepts, so it carries no
        // "additionalProperties: false" the way the output side would.
        expect(result.inputSchema).toEqual({
            fields: {
                $schema: str("https://json-schema.org/draft/2020-12/schema"),
                type: str("object"),
                properties: struct({name: struct({type: str("string")})}),
                required: list(str("name")),
            },
        });
        expect(result.outputSchema).toEqual({
            fields: {
                $schema: str("https://json-schema.org/draft/2020-12/schema"),
                type: str("string"),
            },
        });
        expect(result.function?.definitionSource).toBe(`action.${action.identifier}`);
        // The identifier Aquila invokes the function by is registered on the action.
        expect(action.subFlowFunctions.has(result.function!.functionIdentifier)).toBe(true);
    });

    it("hands a sub flow parameter to the handler with the caller's name and description", async () => {
        const seen: {name?: string; description?: string}[] = [];
        action.runtimeFunctions.set("fn", runtimeFunction({
            parameters: [{runtimeName: "callback", type: "CONSUMER<STRING>"}],
            handler: (callback: SubFlow) => {
                seen.push({name: callback.name, description: callback.description});
                return "ok";
            },
        }));

        handle(action, request("fn", [subFlowParam({
            executionIdentifier: "sub-1",
            name: "on_each_row",
            description: "Runs for every row",
        })]));
        await new Promise(resolve => setImmediate(resolve));

        expect(seen).toEqual([{name: "on_each_row", description: "Runs for every row"}]);
    });

    it("gives each returned sub flow function its own identifier", async () => {
        action.runtimeFunctions.set("fn", runtimeFunction({handler: () => subFlowFunction(() => null)}));

        handle(action, request("fn"));
        handle(action, request("fn"));
        await new Promise(resolve => setImmediate(resolve));

        expect(sent).toHaveLength(2);
        expect(action.subFlowFunctions.size).toBe(2);
    });

    it("executes a registered sub flow function with every parameter of the request", async () => {
        const identifier = action.registerSubFlowFunction(subFlowFunction(name => `Hi ${name}`));

        handle(action, request(identifier, [literalParam(str("Ada"))]));
        await new Promise(resolve => setImmediate(resolve));

        expect(sentResult(sent)).toEqual({oneofKind: "rawValue", rawValue: str("Hi Ada")});
    });

    it("passes a plain JSON schema object through unchanged", async () => {
        action.runtimeFunctions.set("fn", runtimeFunction({
            handler: () => ({...subFlowFunction(() => null), outputSchema: {type: "string"}}),
        }));

        handle(action, request("fn"));
        await new Promise(resolve => setImmediate(resolve));

        const value = sentResult(sent);
        if (value.oneofKind !== "subFlowFunctionResult") throw new Error("expected a sub flow function result");
        expect(value.subFlowFunctionResult.outputSchema).toEqual({fields: {type: str("string")}});
    });

    it("reports an unnamed sub flow function as an error", async () => {
        action.runtimeFunctions.set("fn", runtimeFunction({
            handler: () => ({...subFlowFunction(() => null), name: ""}),
        }));

        handle(action, request("fn"));
        await new Promise(resolve => setImmediate(resolve));

        expect(sentError(sent).code).toBe("SUB_FLOW_FUNCTION_MISSING_NAME");
        expect(action.subFlowFunctions.size).toBe(0);
    });
});

describe("sub flow function lifetime", () => {
    let action: Action;
    let sent: ActionTransferRequest[];

    beforeEach(() => {
        vi.useFakeTimers();
        ({action, sent} = stubAction());
    });

    afterEach(() => vi.useRealTimers());

    it("keeps a function invocable right up to its lifetime", () => {
        const identifier = action.registerSubFlowFunction(subFlowFunction(() => null));

        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS - 1);

        expect(action.subFlowFunctions.get(identifier)).toBeDefined();
    });

    it("drops a function once its lifetime has passed", () => {
        const identifier = action.registerSubFlowFunction(subFlowFunction(() => null));

        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS);

        expect(action.subFlowFunctions.get(identifier)).toBeUndefined();
    });

    it("frees an expired function without waiting for a read", () => {
        action.registerSubFlowFunction(subFlowFunction(() => null));
        expect(action.subFlowFunctions.size).toBe(1);

        // The scheduled sweep clears the entry on its own, so nothing is held just
        // because no one looked the function up again.
        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS);

        expect(action.subFlowFunctions.size).toBe(0);
    });

    it("does not extend a lifetime when the function is invoked", () => {
        const identifier = action.registerSubFlowFunction(subFlowFunction(() => null));

        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS / 2);
        expect(action.subFlowFunctions.get(identifier)).toBeDefined();
        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS / 2);

        expect(action.subFlowFunctions.get(identifier)).toBeUndefined();
    });

    it("fails the node instead of running an expired function", () => {
        const identifier = action.registerSubFlowFunction(subFlowFunction(() => null));
        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS);

        handle(action, request(identifier, [literalParam(str("Ada"))]));

        const error = sentError(sent);
        expect(error.code).toBe("SUB_FLOW_FUNCTION_EXPIRED");
        expect(error.message).toContain(identifier);
    });

    it("sends nothing for a function it never minted", () => {
        handle(action, request("not_a_function"));

        expect(sent).toEqual([]);
    });

    it("expires entries in registration order", () => {
        const first = action.registerSubFlowFunction(subFlowFunction(() => null));
        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS / 2);
        const second = action.registerSubFlowFunction(subFlowFunction(() => null));

        vi.advanceTimersByTime(SUB_FLOW_FUNCTION_TTL_MS / 2);

        expect(action.subFlowFunctions.get(first)).toBeUndefined();
        expect(action.subFlowFunctions.get(second)).toBeDefined();
    });
});
