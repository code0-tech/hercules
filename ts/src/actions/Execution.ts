import {constructValue, PlainValue} from "@code0-tech/tucana/helpers";
import {ActionExecutionRequest, ActionExecutionResponse, ActionTransferRequest} from "@code0-tech/tucana/aquila";
import {NodeExecutionResult, Error as ProtoError} from "@code0-tech/tucana/shared";
import {FunctionContext, RuntimeError} from "../types";
import {RuntimeFunctionProps} from "../models/runtime_function.model";
import {ResolvedValue, resolveNodeValue} from "../internal/literal";
import {CodeZeroEvent} from "../events";
import type {Action} from "../action";

export const packetType = "execution";

function nowMicros(): bigint {
    return BigInt(Math.floor((performance.timeOrigin + performance.now()) * 1000));
}

function buildParams(action: Action, execution: ActionExecutionRequest, func: RuntimeFunctionProps): (ResolvedValue | undefined)[] {
    return (func.parameters || []).map((_param, index) =>
        resolveNodeValue(action, execution.parameters?.[index]),
    );
}

export function handle(action: Action, execution: ActionExecutionRequest): void {
    action.emit(CodeZeroEvent.executionRequestReceived, execution);

    const func = action.runtimeFunctions.get(execution.functionIdentifier);
    if (!func) {
        console.error("Received execution request for unknown function:", execution.functionIdentifier);
        return;
    }

    const params = buildParams(action, execution, func);

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
    const funcHandler = func.handler;
    const allParams: (PlainValue | undefined)[] =
        funcHandler.length === params.length + 1 ? [context as PlainValue, ...params] : params;

    Promise.resolve(funcHandler(...allParams)).then((value: PlainValue) => {
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
                        result: {oneofKind: "success", success: constructValue(value ?? null)},
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
