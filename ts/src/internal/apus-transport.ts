// Builds the `functions` an `ApusClient` (@code0-apus/apus) dispatches `CALL`s to
// from this action's registered runtime functions, mirroring actions/Execution.ts's
// dispatch for the gRPC control plane: the exact same `RuntimeFunctionProps.handler`
// runs either way, given the exact same shape of `FunctionContext`. Two differences
// from the gRPC path, both already handled by `@code0-apus/apus` itself before a
// handler is ever called:
//
// - Template parameters are already resolved to their final value.
// - A sub-flow parameter already arrives as a callable `SubFlow` function (see
//   `@code0-apus/apus`'s `toCallable`) rather than something hercules has to wrap —
//   `internal/literal.ts`'s `toSubFlowCaller` has no Apus equivalent to call because
//   there is nothing left for it to do.
//
// `FunctionContext.executeFlow` is the one genuinely different piece here: it goes
// through `Action.executeFlowInProject` with this call's own project id, which uses
// the Apus data plane directly rather than a gRPC round trip once `connectApus` has
// run (see `Action.executeFlow`/`executeFlowInProject`).

import type {CallContext, FunctionHandler} from "@code0-apus/apus";
import type {Action} from "../action";
import type {FunctionContext, PlainValue} from "../types";
import {toApusCallResult} from "./apus-value";

/**
 * One `FunctionHandler` per registered runtime function, keyed by runtime name —
 * `ApusClient` derives both `HELLO`'s function list and its `CALL` method-index
 * dispatch from this record's keys, in insertion order.
 */
export function buildApusFunctions(action: Action): Record<string, FunctionHandler> {
    const functions: Record<string, FunctionHandler> = {};
    for (const [identifier, def] of action.runtimeFunctions.entries()) {
        const parameterCount = def.parameters?.length ?? 0;
        functions[identifier] = (ctx: CallContext, ...args: unknown[]): unknown => {
            const projectId = BigInt(ctx.projectId);
            const context: FunctionContext = {
                projectId,
                executionId: ctx.executionId,
                matchedConfig: action.configs.get(projectId) ?? {
                    projectId,
                    configValues: [],
                    findConfig: () => undefined,
                },
                executeFlow: (flowId, payload) => action.executeFlowInProject(flowId, projectId, payload),
            };
            // A sub-flow parameter's declared position still counts towards
            // `parameterCount` (it is a real parameter, just not a literal one), so
            // slicing to it rather than to `args.length` keeps extra positions a
            // misbehaving caller might add from leaking into the handler.
            const params = args.slice(0, parameterCount);
            const funcHandler = def.handler;
            const allArgs = funcHandler.length === params.length + 1 ? [context as PlainValue, ...params] : params;
            return Promise.resolve(funcHandler(...(allArgs as (PlainValue | undefined)[])))
                .then(value => toApusCallResult(action, value));
        };
    }
    return functions;
}
