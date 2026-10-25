import {constructValue, PlainValue} from "@code0-tech/tucana/helpers";
import {ActionExecutionRequest, ActionExecutionResponse, ActionTransferRequest} from "@code0-tech/tucana/aquila";
import {NodeExecutionResult, NodeValueExecutionResult, Error as ProtoError} from "@code0-tech/tucana/shared";
import {FunctionContext, RuntimeError} from "../types";
import type {RuntimeFunctionReturn} from "../models/runtime_function.model";
import {ResolvedValue, resolveNodeValue} from "../internal/literal";
import {buildSubFlowFunctionResult, isSubFlowFunctionDefinition} from "../internal/sub-flow-function";
import {CodeZeroEvent} from "../events";
import type {Action} from "../action";

export const packetType = "execution";

/** A function an execution request may address: a registered runtime function, or a sub flow function returned by one. */
interface ExecutionTarget {
    handler: (...args: (PlainValue | undefined)[]) => Promise<RuntimeFunctionReturn> | RuntimeFunctionReturn;
    /**
     * Number of declared parameters. Undefined for a sub flow function, which has no
     * definition declaring them, so every parameter of the request is passed through.
     */
    parameterCount?: number;
}

function nowMicros(): bigint {
    return BigInt(Math.floor((performance.timeOrigin + performance.now()) * 1000));
}

function resolveTarget(action: Action, identifier: string): ExecutionTarget | undefined {
    const func = action.runtimeFunctions.get(identifier);
    if (func) return {handler: func.handler, parameterCount: func.parameters?.length ?? 0};

    const subFlowFunction = action.subFlowFunctions.get(identifier);
    // Bind rather than wrap so the handler keeps its arity, which decides whether a
    // function context is passed in (see below).
    if (subFlowFunction) return {handler: subFlowFunction.run.bind(subFlowFunction)};

    return undefined;
}

function buildParams(action: Action, execution: ActionExecutionRequest, target: ExecutionTarget): (ResolvedValue | undefined)[] {
    const count = target.parameterCount ?? execution.parameters.length;
    return Array.from({length: count}, (_value, index) =>
        resolveNodeValue(action, execution.parameters?.[index]),
    );
}

/**
 * Wrap a handler's return value in a `NodeValueExecutionResult`: raw data goes out as
 * a value, a returned sub flow function is registered on the action and reported as a
 * `SubFlowFunctionResult` so the flow can invoke it later.
 */
function toNodeValue(action: Action, value: RuntimeFunctionReturn): NodeValueExecutionResult {
    if (isSubFlowFunctionDefinition(value)) {
        return NodeValueExecutionResult.create({
            value: {
                oneofKind: "subFlowFunctionResult",
                subFlowFunctionResult: buildSubFlowFunctionResult(action, value),
            },
        });
    }
    return NodeValueExecutionResult.create({
        value: {oneofKind: "rawValue", rawValue: constructValue(value ?? null)},
    });
}

export function handle(action: Action, execution: ActionExecutionRequest): void {
    action.emit(CodeZeroEvent.executionRequestReceived, execution);

    const target = resolveTarget(action, execution.functionIdentifier);
    if (!target) {
        console.error("Received execution request for unknown function:", execution.functionIdentifier);
        return;
    }

    const params = buildParams(action, execution, target);

    const conf = action.configs.get(execution.projectId) ?? {
        projectId: 0n,
        configValues: [],
        findConfig: () => undefined,
    };

    const context: FunctionContext = {
        projectId: execution.projectId,
        executionId: execution.executionIdentifier,
        matchedConfig: conf,
        executeFlow: (flowId, payload) => action.executeFlow(flowId, payload),
    };

    const startedAt = nowMicros();
    const funcHandler = target.handler;
    const allParams: (PlainValue | undefined)[] =
        funcHandler.length === params.length + 1 ? [context as PlainValue, ...params] : params;

    Promise.resolve(funcHandler(...allParams)).then((value: RuntimeFunctionReturn) => {
        const finishedAt = nowMicros();
        action.stream!.requests.send(ActionTransferRequest.create({
            data: {
                oneofKind: "result",
                result: ActionExecutionResponse.create({
                    executionIdentifier: execution.executionIdentifier,
                    nodeResult: NodeExecutionResult.create({
                        id: {oneofKind: undefined},
                        startedAt,
                        finishedAt,
                        parameterResults: [],
                        result: {oneofKind: "success", success: toNodeValue(action, value)},
                    }),
                }),
            },
        })).catch(err => console.error("Failed to send execution result:", err));

    }).catch((error: unknown) => {
        const finishedAt = nowMicros();
        const isRuntimeError = error instanceof RuntimeError;
        action.stream!.requests.send(ActionTransferRequest.create({
            data: {
                oneofKind: "result",
                result: ActionExecutionResponse.create({
                    executionIdentifier: execution.executionIdentifier,
                    nodeResult: NodeExecutionResult.create({
                        id: {oneofKind: undefined},
                        startedAt,
                        finishedAt,
                        parameterResults: [],
                        result: {
                            oneofKind: "error",
                            error: ProtoError.create({
                                code: isRuntimeError ? (error as RuntimeError).code : "UNKNOWN_ERROR",
                                category: "RUNTIME",
                                message: isRuntimeError
                                    ? ((error as RuntimeError).description || (error as Error).message)
                                    : String(error),
                                timestamp: finishedAt,
                                version: action.version,
                                dependencies: {},
                            }),
                        },
                    }),
                }),
            },
        })).catch(err => console.error("Failed to send execution error:", err));
    });
}
