import {PlainValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import type {Value} from "@code0-tech/tucana/shared";
import type {ActionLiteralValue, ActionNodeSubFlowValue, ActionNodeValue} from "@code0-tech/tucana/aquila";
import {RuntimeError, SubFlow} from "../types";
import type {Action} from "../action";

/** A resolved parameter/reference value: either a plain value or a callable sub flow. */
export type ResolvedValue = PlainValue | SubFlow;

/** Matches every `${signature}` placeholder inside a string. */
const REFERENCE_PATTERN = /\$\{([^}]+)\}/g;
/** Matches a string that consists of exactly one `${signature}` placeholder. */
const SOLE_REFERENCE_PATTERN = /^\$\{([^}]+)\}$/;

/**
 * Wrap a sub flow value in a caller that executes it and exposes its declared I/O
 * schema (either may be undefined if the caller omitted it).
 */
export function toSubFlowCaller(action: Action, subFlow: ActionNodeSubFlowValue): SubFlow {
    const caller = (...args: PlainValue[]) => action.executeSubFlow(subFlow, ...args);
    return Object.assign(caller, {
        inputSchema: subFlow.inputSchema,
        outputSchema: subFlow.outputSchema,
    });
}

/**
 * Resolve a single parameter node into a concrete value. Literal values have their
 * inline `${signature}` references substituted; sub flows become callable.
 */
export function resolveNodeValue(action: Action, node: ActionNodeValue | undefined): ResolvedValue | undefined {
    if (node?.value.oneofKind === "literalValue") {
        return resolveLiteral(action, node.value.literalValue);
    }
    if (node?.value.oneofKind === "subFlow") {
        return toSubFlowCaller(action, node.value.subFlow);
    }
    return undefined;
}

/**
 * Resolve an {@link ActionLiteralValue} into a plain value. Any `${signature}`
 * placeholder inside a (possibly nested) string leaf is substituted with the value
 * of the matching inline reference. A string that is exactly `${signature}` adopts
 * the referenced value verbatim (preserving its type); mixed strings interpolate the
 * referenced value as text. Unknown signatures are left untouched.
 */
export function resolveLiteral(action: Action, literal: ActionLiteralValue): ResolvedValue {
    const references = new Map<string, ResolvedValue | undefined>();
    for (const reference of literal.references) {
        references.set(reference.signature, resolveNodeValue(action, reference.value));
    }
    return literal.value != null ? resolveValue(literal.value, references) : null;
}

function resolveValue(value: Value, references: Map<string, ResolvedValue | undefined>): ResolvedValue {
    switch (value.kind.oneofKind) {
        case "stringValue":
            return resolveString(value.kind.stringValue, references);
        case "structValue": {
            const result: Record<string, ResolvedValue> = {};
            for (const [key, field] of Object.entries(value.kind.structValue.fields)) {
                result[key] = resolveValue(field, references);
            }
            return result;
        }
        case "listValue":
            return value.kind.listValue.values.map((element) => resolveValue(element, references));
        default:
            // Numbers, booleans and null cannot carry placeholders.
            return toAllowedValue(value);
    }
}

function resolveString(raw: string, references: Map<string, ResolvedValue | undefined>): ResolvedValue {
    const sole = raw.match(SOLE_REFERENCE_PATTERN);
    if (sole) {
        const signature = sole[1];
        // Adopt the referenced value verbatim so its type (number, object, sub flow, …) is preserved.
        return references.has(signature) ? (references.get(signature) as ResolvedValue) : raw;
    }
    return raw.replace(REFERENCE_PATTERN, (placeholder, signature: string) =>
        references.has(signature) ? stringifyReference(signature, references.get(signature)) : placeholder,
    );
}

function stringifyReference(signature: string, value: ResolvedValue | undefined): string {
    if (value == null) return "";
    if (typeof value === "string") return value;
    if (typeof value === "function") {
        // A sub flow has no textual form, so it cannot be interpolated into a string.
        throw new RuntimeError(
            "INLINE_REFERENCE_NOT_STRINGIFIABLE",
            `Inline reference \${${signature}} resolves to a sub flow and cannot be interpolated into a string`,
        );
    }
    if (typeof value === "bigint" || typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return JSON.stringify(value);
}
