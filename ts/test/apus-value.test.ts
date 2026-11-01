import {describe, expect, it} from "vitest";
import {ApusFunction, ApusStream, ApusTemplate, SubFlowHandle} from "@code0-apus/apus";
import {z} from "zod";
import {Action} from "../src/action";
import {RuntimeError, type SubFlowFunctionDefinition} from "../src/types";
import {toApusCallResult, toPlainValue} from "../src/internal/apus-value";

function action(): Action {
    return new Action("my_action", "1.0.0", undefined, "me", "icon", "docs", []);
}

const subFlowFunction = (overrides: Partial<SubFlowFunctionDefinition> = {}): SubFlowFunctionDefinition => ({
    name: "greet",
    description: "Greets someone",
    inputSchema: z.object({name: z.string()}),
    outputSchema: z.string(),
    run: name => `Hi ${String(name)}`,
    ...overrides,
});

describe("toApusCallResult", () => {
    it("passes raw data through unchanged", () => {
        expect(toApusCallResult(action(), "hello")).toBe("hello");
        expect(toApusCallResult(action(), 42)).toBe(42);
        expect(toApusCallResult(action(), null)).toBeNull();
        expect(toApusCallResult(action(), undefined as never)).toBeNull();
    });

    it("converts a returned sub flow function into an ApusFunction and registers it", () => {
        const a = action();
        const result = toApusCallResult(a, subFlowFunction());

        expect(result).toBeInstanceOf(ApusFunction);
        const fn = result as ApusFunction;
        expect(fn.name).toBe("greet");
        expect(fn.description).toBe("Greets someone");
        expect(fn.definitionSource).toBe("action");
        // Zod schemas convert to plain JSON schema objects, the same shape the
        // gRPC path (sub-flow-function.ts's toStruct) derives its wire Struct from.
        expect(fn.inputSchema).toMatchObject({type: "object", properties: {name: {type: "string"}}});
        expect(fn.outputSchema).toMatchObject({type: "string"});
        // The identifier Taurus/Aquila invoke the function by is registered on the action.
        expect(a.subFlowFunctions.has(fn.identifier)).toBe(true);
    });

    it("gives each returned sub flow function its own identifier", () => {
        const a = action();
        const first = toApusCallResult(a, subFlowFunction()) as ApusFunction;
        const second = toApusCallResult(a, subFlowFunction()) as ApusFunction;

        expect(first.identifier).not.toBe(second.identifier);
        expect(a.subFlowFunctions.size).toBe(2);
    });

    it("rejects an unnamed sub flow function instead of registering it", () => {
        const a = action();
        expect(() => toApusCallResult(a, subFlowFunction({name: ""}))).toThrow(RuntimeError);
        try {
            toApusCallResult(a, subFlowFunction({name: ""}));
        } catch (err) {
            expect((err as RuntimeError).code).toBe("SUB_FLOW_FUNCTION_MISSING_NAME");
        }
        expect(a.subFlowFunctions.size).toBe(0);
    });
});

describe("toPlainValue", () => {
    it("passes the literal subset through unchanged", () => {
        expect(toPlainValue(null)).toBeNull();
        expect(toPlainValue(true)).toBe(true);
        expect(toPlainValue(7)).toBe(7);
        expect(toPlainValue(1n << 60n)).toBe(1n << 60n);
        expect(toPlainValue("hi")).toBe("hi");
        expect(toPlainValue([1, "a", null])).toEqual([1, "a", null]);
        expect(toPlainValue({a: 1, b: "two"})).toEqual({a: 1, b: "two"});
    });

    it("has no PlainValue form for the non-literal Apus variants, so they become null", () => {
        expect(toPlainValue(new ApusStream(1, "application/octet-stream", -1))).toBeNull();
        expect(toPlainValue(new SubFlowHandle("sub-1", null, null))).toBeNull();
        expect(toPlainValue(new ApusTemplate("hi ${x}", [["x", "there"]]))).toBeNull();
        expect(toPlainValue(new ApusFunction("fn-1"))).toBeNull();
    });
});
