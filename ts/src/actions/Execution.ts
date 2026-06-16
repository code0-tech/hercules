import {constructValue, PlainValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import {ActionExecutionRequest, ActionExecutionResponse, ActionTransferRequest} from "@code0-tech/tucana/aquila";
import {NodeExecutionResult, Error as ProtoError} from "@code0-tech/tucana/shared";
import {HerculesFunctionContext, RuntimeErrorException} from "../types";
import {HerculesRuntimeFunctionDefinition} from "../models/runtime-function";
import {CodeZeroEvent} from "../events";
import type {Action} from "../action";

export const packetType = "execution";

function buildParams(execution: ActionExecutionRequest, func: HerculesRuntimeFunctionDefinition): (PlainValue | undefined)[] {
    return (func.parameters || []).map(param => {
        const field = execution.parameters?.fields?.[param.runtimeName];
        return field ? toAllowedValue(field) : undefined;
    });
}

export function handle(action: Action, execution: ActionExecutionRequest): void {
    action.emit(CodeZeroEvent.executionRequestReceived, execution);

    const func = action.runtimeFunctions.get(execution.functionIdentifier);
    if (!func) {
        console.error("Received execution request for unknown function:", execution.functionIdentifier);
        return;
    }

    const params = buildParams(execution, func);

    const conf = action.configs.get(execution.projectId) ?? {
        projectId: 0n,
        configValues: [],
        findConfig: () => undefined,
    };

    const context: HerculesFunctionContext = {
        projectId: execution.projectId,
        executionId: execution.executionIdentifier,
        matchedConfig: conf,
    };

    const startedAt = BigInt(Date.now());
    const funcHandler = func.handler;
    const allParams: (PlainValue | undefined)[] =
        funcHandler.length === params.length + 1 ? [context as PlainValue, ...params] : params;

    Promise.resolve(funcHandler(...allParams)).then((value: PlainValue) => {
        const finishedAt = BigInt(Date.now());
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
                        result: {oneofKind: "success", success: constructValue(value)},
                    }),
                }),
            },
        })).catch(err => console.error("Failed to send execution result:", err));

    }).catch((error: unknown) => {
        const finishedAt = BigInt(Date.now());
        const isRuntimeError = error instanceof RuntimeErrorException;
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
                                code: isRuntimeError ? (error as RuntimeErrorException).code : "UNKNOWN_ERROR",
                                category: "RUNTIME",
                                message: isRuntimeError
                                    ? ((error as RuntimeErrorException).description || (error as Error).message)
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
