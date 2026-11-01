// Bridges this SDK's PlainValue (@code0-tech/tucana/helpers) to Apus wire values
// (@code0-apus/apus's ApusValue), mirroring the apus repo's proof of concept action
// (apus/actions/http-action/src/apus/aquila.ts's fromValue/toValue).
//
// Unlike the gRPC <-> PlainValue bridge, this one is nearly a no-op: PlainValue
// (`null | bigint | number | string | boolean | Array<PlainValue> | object`) and
// ApusValue's literal subset are structurally identical — the wire protocol and
// tucana's own helper agree on using `bigint` for integers that do not fit a safe
// JS number. The only real conversion needed is for the two directions where the
// shapes diverge: a handler returning a {@link SubFlowFunctionDefinition} instead of
// data (becomes an `ApusFunction`), and a stray non-literal `ApusValue` reaching a
// plain result (streams/templates/sub-flow handles have no `PlainValue` form).

import {ApusFunction, ApusStream, ApusTemplate, SubFlowHandle, type ApusValue} from "@code0-apus/apus";
import type {PlainValue} from "@code0-tech/tucana/helpers";
import {RuntimeError, type SubFlowFunctionDefinition} from "../types";
import type {RuntimeFunctionReturn} from "../models/runtime_function.model";
import {isSubFlowFunctionDefinition, schemaToPlainValue} from "./sub-flow-function";
import type {Action} from "../action";

/**
 * A handler's returned value -> the Apus `RETURN` value. Raw data passes straight
 * through (see the module docs); a returned sub flow function is registered on the
 * action (the same registry/TTL the gRPC path uses) and reported as an
 * `ApusFunction`, Apus's equivalent of a `shared.SubFlowFunctionResult`.
 */
export function toApusCallResult(action: Action, value: RuntimeFunctionReturn): ApusValue {
    if (!isSubFlowFunctionDefinition(value)) return (value ?? null) as ApusValue;
    return toApusFunction(action, value);
}

function toApusFunction(action: Action, definition: SubFlowFunctionDefinition): ApusFunction {
    if (!definition.name) {
        throw new RuntimeError(
            "SUB_FLOW_FUNCTION_MISSING_NAME",
            "A sub flow function returned from a run block must declare a name",
        );
    }
    const identifier = action.registerSubFlowFunction(definition);
    return new ApusFunction(
        identifier,
        "action",
        schemaToPlainValue(definition.inputSchema ?? {}, "input") as ApusValue,
        schemaToPlainValue(definition.outputSchema ?? {}, "output") as ApusValue,
        definition.name,
        definition.description ?? "",
    );
}

/**
 * An Apus value (an `EXEC_RESULT`/`SUBFLOW_RESULT` payload, or a sub-flow call's
 * result) -> `PlainValue`. The non-literal `ApusValue` variants have no `PlainValue`
 * form; in practice none of them are expected here (Apus resolves templates and
 * materializes text streams before a value like this is ever produced), so they
 * become `null` defensively rather than throwing.
 */
export function toPlainValue(value: ApusValue): PlainValue {
    if (value instanceof ApusTemplate || value instanceof SubFlowHandle || value instanceof ApusStream || value instanceof ApusFunction) {
        return null;
    }
    return value as PlainValue;
}
