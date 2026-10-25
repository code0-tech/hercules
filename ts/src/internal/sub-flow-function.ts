import {constructValue, type PlainValue} from "@code0-tech/tucana/helpers";
import {SubFlowFunctionResult, type Struct} from "@code0-tech/tucana/shared";
import type {ZodTypeAny} from "zod";
import {RuntimeError, type SubFlowFunctionDefinition, type SubFlowFunctionSchema} from "../types";
import {zodToJsonSchema} from "./zod-schema";
import type {Action} from "../action";

/**
 * True when a runtime function's `run` block returned a sub flow function instead of
 * raw data. A sub flow function is told apart from a plain object by its callable
 * `run` property — plain values never carry functions.
 */
export function isSubFlowFunctionDefinition(value: unknown): value is SubFlowFunctionDefinition {
    return typeof value === "object"
        && value !== null
        && typeof (value as SubFlowFunctionDefinition).run === "function";
}

/**
 * True for a zod schema. Duck-typed rather than checked with `instanceof`, so a
 * schema built by a second copy of zod in the dependency tree still matches.
 */
function isZodSchema(schema: SubFlowFunctionSchema): schema is ZodTypeAny {
    const candidate = schema as {parse?: unknown; safeParse?: unknown};
    return typeof candidate.parse === "function" && typeof candidate.safeParse === "function";
}

/** True for a ready-made protobuf {@link Struct} rather than a plain schema object. */
function isStruct(schema: SubFlowFunctionSchema): schema is Struct {
    const fields = (schema as Struct).fields;
    if (fields == null || typeof fields !== "object") return false;
    return Object.values(fields).every(field =>
        field != null && typeof field === "object" && "kind" in field);
}

/**
 * Convert a declared schema into the `shared.Struct` the protobuf field expects. A
 * zod schema becomes a JSON schema first — describing the input it accepts for a
 * function's input schema, and the output it produces for its output schema.
 */
export function toStruct(schema: SubFlowFunctionSchema, io: "input" | "output"): Struct | undefined {
    if (isStruct(schema)) return schema;
    const json = isZodSchema(schema) ? zodToJsonSchema(schema, io) : schema;
    const value = constructValue(json as PlainValue);
    return value.kind.oneofKind === "structValue" ? value.kind.structValue : undefined;
}

/**
 * Register the sub flow function on the action and build the
 * `shared.SubFlowFunctionResult` that reports it back to Aquila. The identifier in
 * the result is the one Aquila sends back on an execution request when the flow
 * invokes the function.
 */
export function buildSubFlowFunctionResult(
    action: Action,
    definition: SubFlowFunctionDefinition,
): SubFlowFunctionResult {
    if (!definition.name) {
        throw new RuntimeError(
            "SUB_FLOW_FUNCTION_MISSING_NAME",
            "A sub flow function returned from a run block must declare a name",
        );
    }
    const functionIdentifier = action.registerSubFlowFunction(definition);
    return SubFlowFunctionResult.create({
        function: {functionIdentifier, definitionSource: "action"},
        name: definition.name,
        description: definition.description ?? "",
        inputSchema: toStruct(definition.inputSchema ?? {}, "input"),
        outputSchema: toStruct(definition.outputSchema ?? {}, "output"),
    });
}
