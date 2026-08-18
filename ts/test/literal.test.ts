import {describe, expect, it} from "vitest";
import type {Value} from "@code0-tech/tucana/shared";
import type {ActionLiteralValue, ActionNodeValue} from "@code0-tech/tucana/aquila";
import {resolveLiteral, resolveNodeValue} from "../src/internal/literal";
import type {Action} from "../src/action";

// Minimal Value builders so the tests read like the data they describe.
const str = (stringValue: string): Value => ({kind: {oneofKind: "stringValue", stringValue}});
const int = (n: bigint): Value => ({kind: {oneofKind: "numberValue", numberValue: {number: {oneofKind: "integer", integer: n}}}});
const bool = (boolValue: boolean): Value => ({kind: {oneofKind: "boolValue", boolValue}});
const list = (...values: Value[]): Value => ({kind: {oneofKind: "listValue", listValue: {values}}});
const struct = (fields: Record<string, Value>): Value => ({kind: {oneofKind: "structValue", structValue: {fields}}});

const literalRef = (signature: string, value: Value, references: ActionLiteralValue["references"] = []): ActionLiteralValue["references"][number] => ({
    signature,
    value: {value: {oneofKind: "literalValue", literalValue: {value, references}}},
});

const literal = (value: Value | undefined, references: ActionLiteralValue["references"] = []): ActionLiteralValue => ({value, references});

// resolveLiteral only touches the Action for sub flow references.
const noopAction = {} as Action;

describe("resolveLiteral", () => {
    it("returns a plain literal untouched when there are no references", () => {
        expect(resolveLiteral(noopAction, literal(str("hello")))).toBe("hello");
        expect(resolveLiteral(noopAction, literal(int(42n)))).toBe(42);
        expect(resolveLiteral(noopAction, literal(undefined))).toBeNull();
    });

    it("adopts the referenced value verbatim when the string is a sole placeholder", () => {
        const result = resolveLiteral(noopAction, literal(str("${count}"), [literalRef("count", int(7n))]));
        expect(result).toBe(7);
    });

    it("preserves non-string reference types on full replacement", () => {
        const result = resolveLiteral(noopAction, literal(str("${enabled}"), [literalRef("enabled", bool(true))]));
        expect(result).toBe(true);
    });

    it("interpolates references into surrounding text", () => {
        const result = resolveLiteral(noopAction, literal(str("Hello ${name}, you are ${age}"), [
            literalRef("name", str("Ada")),
            literalRef("age", int(36n)),
        ]));
        expect(result).toBe("Hello Ada, you are 36");
    });

    it("leaves unknown signatures untouched", () => {
        expect(resolveLiteral(noopAction, literal(str("${missing}")))).toBe("${missing}");
        expect(resolveLiteral(noopAction, literal(str("a ${missing} b")))).toBe("a ${missing} b");
    });

    it("resolves placeholders inside nested structs and lists", () => {
        const value = struct({
            greeting: str("Hi ${name}"),
            tags: list(str("${primary}"), str("static")),
        });
        const result = resolveLiteral(noopAction, literal(value, [
            literalRef("name", str("Grace")),
            literalRef("primary", int(1n)),
        ]));
        expect(result).toEqual({greeting: "Hi Grace", tags: [1, "static"]});
    });

    it("stringifies structured references during interpolation", () => {
        const result = resolveLiteral(noopAction, literal(str("payload=${obj}"), [
            literalRef("obj", struct({a: int(1n)})),
        ]));
        expect(result).toBe('payload={"a":1}');
    });

    it("resolves references that themselves contain references", () => {
        const nested = literalRef("outer", str("<${inner}>"), [literalRef("inner", str("deep"))]);
        const result = resolveLiteral(noopAction, literal(str("${outer}"), [nested]));
        expect(result).toBe("<deep>");
    });

    it("throws when a sub flow reference is interpolated into a string", () => {
        const action = {executeSubFlow: () => Promise.resolve(null)} as unknown as Action;
        const subFlowRef: ActionLiteralValue["references"][number] = {
            signature: "run",
            value: {value: {oneofKind: "subFlow", subFlow: {executionIdentifier: "x"}}},
        };
        expect(() => resolveLiteral(action, literal(str("result: ${run}"), [subFlowRef]))).toThrow(/cannot be interpolated/);
    });
});

describe("resolveNodeValue", () => {
    it("returns undefined for an absent node", () => {
        expect(resolveNodeValue(noopAction, undefined)).toBeUndefined();
    });

    it("wraps a sub flow node in a caller exposing its schema", async () => {
        const calls: unknown[][] = [];
        const action = {
            executeSubFlow: (subFlow: unknown, ...args: unknown[]) => {
                calls.push([subFlow, ...args]);
                return Promise.resolve("done");
            },
        } as unknown as Action;
        const node: ActionNodeValue = {
            value: {oneofKind: "subFlow", subFlow: {executionIdentifier: "sf", inputSchema: {fields: {}}}},
        };
        const caller = resolveNodeValue(action, node) as ((...args: unknown[]) => Promise<unknown>) & {inputSchema?: unknown};
        expect(typeof caller).toBe("function");
        expect(caller.inputSchema).toEqual({fields: {}});
        await expect(caller("a")).resolves.toBe("done");
        expect(calls).toEqual([[{executionIdentifier: "sf", inputSchema: {fields: {}}}, "a"]]);
    });
});
