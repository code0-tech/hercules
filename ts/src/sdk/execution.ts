import {logger} from "../logger";
import {constructValue, PlainValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import {
    SdkState,
    HerculesFunctionContext,
    RuntimeErrorException, RegisteredRuntimeFunction
} from "../types.js";
import {TransferRequest, ExecutionRequest, TransferResponse} from "@code0-tech/tucana/aquila";
import {ActionProjectConfiguration} from "@code0-tech/tucana/shared";

function buildParams(execution: ExecutionRequest, func: RegisteredRuntimeFunction, message: TransferResponse) {
    const params = Object.entries(execution.parameters!.fields!).map(([key, value]) => {
        const param = func.definition.runtimeParameterDefinitions
            .find(p => p.runtimeName === key);

        const parameterValue = param ? toAllowedValue(value) : undefined;
        if (!parameterValue) return parameterValue
        return parameterValue;
    });

    logger.debug({
        message,
        BuiltParameter: params
    })
    return params
}

function buildContext(message: TransferResponse, execution: ExecutionRequest, state: SdkState): {
    func: RegisteredRuntimeFunction,
    context: HerculesFunctionContext,
    conf: ActionProjectConfiguration,
    params: (PlainValue | undefined)[]
} {
    const func = state.runtimeFunctions.find(value => value.identifier == execution.functionIdentifier);

    if (!func) {
        logger.error({
            message,
            state
        }, "Received execution request but no matching function found")
        throw new Error("Received execution request for function " + execution.functionIdentifier + " but no matching function found")
    }

    const params = buildParams(execution, func, message);

    let conf = state.projectConfigurations.find(config => {
        //TODO
        return true
    })

    if (!conf) {
        logger.error({
            message,
            execution
        }, "No configuration found")
        conf = {
            projectId: 0n,
            actionConfigurations: []
        }
    }
    const context: HerculesFunctionContext = {
        projectId: execution.projectId,
        executionId: execution.executionIdentifier,
        matchedConfig: {
            projectId: conf.projectId,
            configValues: conf.actionConfigurations.map(value => {
                return {
                    identifier: value.identifier,
                    value: toAllowedValue(value.value || constructValue(null)),
                }
            }),
            findConfig: identifier => {
                const config = conf.actionConfigurations.find(config => config.identifier === identifier);
                return config ? toAllowedValue(config.value || constructValue(null)) : undefined;
            }
        }
    }
    return {
        func,
        context,
        conf,
        params
    };
}

export function handleExecutionRequest(state: SdkState, message: TransferResponse) {
    if (!message.data || message.data.oneofKind !== "execution") {
        return
    }
    const execution = message.data.execution as ExecutionRequest;


    const {func, context, conf, params} = buildContext(message, execution, state);
    logger.debug({
        message,
        conf,
        context
    })

    const funcHandler = (func as any).handler

    if (funcHandler.length == params.length + 1) {
        // handler has context parameter
        params.unshift(context)
    } else if (funcHandler.length > params.length + 1) {
        logger.error({
            params,
            func,
        }, "Handler has more parameters than provided arguments")
        return;
    }

    const result = new Promise((resolve, reject) => {
        try {
            resolve(funcHandler(...params))
        } catch (e) {
            reject(e)
        }
    })
    result.then((value: any) => {
        const request = TransferRequest.create({
            data: {
                oneofKind: "result",
                result: {
                    executionIdentifier: execution.executionIdentifier,
                    result: {
                        oneofKind: "success",
                        success: constructValue(value)
                    },
                }
            }
        });
        logger.debug({
            request: request
        }, "Responding with execution result")

        state.stream!.requests.send(request).catch(reason => {
            logger.error({
                err: reason,
                request: request,
                message,
                execution
            }, "Responding with execution result lead to error")
        });

    }).catch(reason => {
        logger.warn({
            err: reason
        }, "Executed function lead to error")
        let errorData
        if (reason instanceof RuntimeErrorException) {
            errorData = {
                code: reason.code,
                description: reason.description
            }
        } else {
            errorData = {
                code: "UNKNOWN_ERROR",
                description: reason.toString()
            }

            logger.warn({
                err: reason,
                func,
                execution
            }, "Error occured while executing function, but not an RuntimeErrorException")
        }


        logger.debug({errorData}, "Responding with execution error")

        const request = TransferRequest.create({
            data: {
                oneofKind: "result",
                result: {
                    executionIdentifier: execution.executionIdentifier,
                    result: {
                        oneofKind: "error",
                        error: errorData
                    },
                }
            }
        });

        state.stream!.requests.send(request).catch(reason => {
            logger.error({
                err: reason,
                request: request,
                execution,
                message
            }, "Failed to send execution result error")
        });
    })
}

