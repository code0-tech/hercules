import {GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {
    ActionSdk, HerculesActionConfigurationDefinition,
    HerculesActionProjectConfiguration, HerculesFunctionContext, SdkState, RuntimeErrorException,
    HerculesRegisterRuntimeFunctionParameter, HerculesRegisterFunctionDefinition
} from "./types.js";
import {
    ActionTransferServiceClient,
    DataTypeServiceClient,
    DataTypeUpdateRequest, ExecutionRequest,
    FlowTypeServiceClient,
    FlowTypeUpdateRequest,
    FunctionDefinitionServiceClient,
    FunctionDefinitionUpdateRequest, RuntimeFunctionDefinitionServiceClient, RuntimeFunctionDefinitionUpdateRequest,
    TransferRequest, TransferResponse
} from "@code0-tech/tucana/aquila";
import {
    ActionConfigurations,
    FlowTypeSetting,
} from "@code0-tech/tucana/shared";
import {constructValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import {logger} from "./logger";

const createSdk = (config: ActionSdk["config"], configDefinitions?: HerculesActionConfigurationDefinition[]): ActionSdk => {
    const transport = new GrpcTransport(
        {
            host: config.aquilaUrl,
            channelCredentials: ChannelCredentials.createInsecure()
        }
    )
    const client = new ActionTransferServiceClient(transport);

    const state: SdkState = {
        functions: [],
        runtimeFunctions: [],
        dataTypes: [],
        flowTypes: [],
        configurationDefinitions: configDefinitions?.map(value => {
            return {
                identifier: value.identifier,
                name: value.name || [],
                description: value.description || [],
                type: value.type,
                linkedDataTypeIdentifiers: value.linkedDataTypes || [],
                defaultValue: constructValue(value.defaultValue || null),
            }
        }) || [],
        projectConfigurations: [],
        transport: transport,
        client: client,
        stream: undefined,
        fullyConnected: false
    }

    const registerFunctionDefinitions = async (...functionDefinitions: Array<HerculesRegisterFunctionDefinition>) => {
        for (const functionDefinition of functionDefinitions) {
            state.functions.push({
                identifier: functionDefinition.runtimeName,
                definition: {
                    displayMessage: functionDefinition.displayMessage || [],
                    name: functionDefinition.name || [],
                    documentation: functionDefinition.documentation || [],
                    description: functionDefinition.description || [],
                    deprecationMessage: functionDefinition.deprecationMessage || [],
                    displayIcon: functionDefinition.displayIcon || "",
                    alias: functionDefinition.alias || [],
                    linkedDataTypeIdentifiers: functionDefinition.linkedDataTypes || [],
                    definitionSource: "action",
                    version: functionDefinition.version || config.version,
                    runtimeName: functionDefinition.runtimeName,
                    parameterDefinitions: (functionDefinition.parameters || []).map(param => ({
                        runtimeName: param.runtimeName,
                        name: param.name || [],
                        description: param.description || [],
                        documentation: param.documentation || [],
                        defaultValue: constructValue(param.defaultValue || null),
                        hidden: param.hidden || false,
                        optional: param.hidden || false,
                    })),
                    signature: functionDefinition.signature,
                    throwsError: functionDefinition.throwsError || false,
                }
            });
        }
        return Promise.resolve()
    };
    const registerRuntimeFunctionDefinitions = async (...runtimeFunctionDefinitions: HerculesRegisterRuntimeFunctionParameter[]) => {
        for (const registeredFunction of runtimeFunctionDefinitions) {
            const handler = registeredFunction.handler;
            const functionDefinition = registeredFunction.definition;
            state.runtimeFunctions.push({
                identifier: functionDefinition.runtimeName,
                definition: {
                    displayMessage: functionDefinition.displayMessage || [],
                    name: functionDefinition.name || [],
                    documentation: functionDefinition.documentation || [],
                    description: functionDefinition.description || [],
                    deprecationMessage: functionDefinition.deprecationMessage || [],
                    displayIcon: functionDefinition.displayIcon || "",
                    alias: functionDefinition.alias || [],
                    linkedDataTypeIdentifiers: functionDefinition.linkedDataTypes || [],
                    definitionSource: "action",
                    version: functionDefinition.version || config.version,
                    runtimeName: functionDefinition.runtimeName,
                    runtimeParameterDefinitions: (functionDefinition.parameters || []).map(param => ({
                        runtimeName: param.runtimeName,
                        name: param.name || [],
                        description: param.description || [],
                        documentation: param.documentation || [],
                        defaultValue: constructValue(param.defaultValue || null),
                    })),
                    signature: functionDefinition.signature,
                    throwsError: functionDefinition.throwsError || false,
                },
                handler: handler,
            });
        }
        return Promise.resolve()
    };
    return {
        fullyConnected(): boolean {
            return state.fullyConnected;
        },
        config,
        onError: handler => {
            state.stream?.responses.onError(handler)
        },
        connect: options => {
            return connect(state, config, options);
        },
        getProjectActionConfigurations: () => {
            return state.projectConfigurations.map(value => {
                return {
                    projectId: value.projectId,
                    configValues: value.actionConfigurations.map(value => {
                        return {
                            identifier: value.identifier,
                            value: toAllowedValue(value.value || constructValue(null)),
                        }
                    }),
                    findConfig: identifier => {
                        const config = value.actionConfigurations.find(config => config.identifier === identifier);
                        return config ? toAllowedValue(config.value || constructValue(null)) : undefined;
                    }
                }
            });
        },
        registerConfigDefinitions: async (...actionConfigurations) => {
            state.configurationDefinitions.push(...(actionConfigurations?.map(value => {
                return {
                    identifier: value.identifier,
                    name: value.name || [],
                    description: value.description || [],
                    type: value.type,
                    linkedDataTypeIdentifiers: value.linkedDataTypes || [],
                    defaultValue: constructValue(value.defaultValue || null),
                }
            }) || []))

            return Promise.resolve()
        },
        registerDataTypes: async (...dataTypes) => {
            dataTypes.forEach(dataType => {
                state.dataTypes.push({
                    identifier: dataType.identifier,
                    name: dataType.name || [],
                    alias: dataType.alias || [],
                    rules: dataType.rules || [],
                    genericKeys: dataType.genericKeys || [],
                    type: dataType.type,
                    linkedDataTypeIdentifiers: dataType.linkedDataTypes || [],
                    displayMessage: dataType.displayMessage || [],
                    definitionSource: "action",
                    version: dataType.version || config.version,
                });
            })


            return Promise.resolve()
        },
        registerFlowTypes: async (...flowTypes) => {
            flowTypes.forEach(flowType => {
                state.flowTypes.push({
                    signature: flowType.signature,
                    identifier: flowType.identifier,
                    name: flowType.name || [],
                    alias: flowType.alias || [],
                    description: flowType.description || [],
                    displayIcon: flowType.displayIcon || "",
                    displayMessage: flowType.displayMessage || [],
                    documentation: flowType.documentation || [],
                    definitionSource: "action",
                    version: flowType.version || config.version,
                    linkedDataTypeIdentifiers: flowType.linkedDataTypes || [],
                    settings: (flowType.settings || []).map(setting => ({
                        name: setting.name || [],
                        defaultValue: constructValue(setting.defaultValue || null),
                        identifier: setting.identifier,
                        description: setting.description || [],
                        unique: setting.unique || 1,
                        linkedDataTypeIdentifiers: setting.linkedDataTypeIdentifiers || [],
                    } as FlowTypeSetting)),
                    editable: flowType.editable || false
                });
            })
            return Promise.resolve()
        },
        registerRuntimeFunctionDefinitionsAndFunctionDefinitions: async (...runtimeFunctionDefinitions) => {
            await Promise.all(runtimeFunctionDefinitions.map(async (register) => {
                await Promise.all([
                    registerRuntimeFunctionDefinitions(
                        register
                    ),
                    registerFunctionDefinitions(
                        {
                            ...register.definition,
                            runtimeDefinitionName: register.definition.runtimeName,
                            parameters: register.definition.parameters?.map(param => {
                                return {
                                    ...param,
                                    runtimeDefinitionName: param.runtimeName,
                                }
                            })
                        }
                    )
                ])
            }));
        },
        registerRuntimeFunctionDefinitions: registerRuntimeFunctionDefinitions,
        registerFunctionDefinitions: registerFunctionDefinitions,
        dispatchEvent: async (eventType, projectId, payload) => {
            if (!state.stream) {
                return Promise.reject("SDK is not connected. Call connect() before dispatching events.");
            }
            const projectIdBigInt = typeof projectId === "bigint"
                ? projectId
                : BigInt(projectId);

            return state.stream.requests.send(
                TransferRequest.create({
                    data: {
                        oneofKind: "event",
                        event: {
                            projectId: projectIdBigInt,
                            eventType: eventType,
                            payload: constructValue(payload) || constructValue(null),
                        }
                    }
                })
            ).catch(reason => {
                return Promise.reject(reason);
            }).then(() => {
                return Promise.resolve();
            })
        }
    }
}

async function connect(state: SdkState, config: ActionSdk["config"], options?: RpcOptions): Promise<HerculesActionProjectConfiguration[]> {
    const builtOptions: RpcOptions = {
        meta: {
            "Authorization": config.authToken,
        },
        ...options
    }
    state.stream = state.client.transfer(builtOptions);

    const dataTypeClient = new DataTypeServiceClient(state.transport)
    await dataTypeClient.update(DataTypeUpdateRequest.create({
        dataTypes: [
            ...state.dataTypes
        ]
    }), builtOptions).then(value => {
        if (!value.response.success) {
            return Promise.reject(value.response);
        }
    }).catch(reason => {
        logger.error({
            err: reason,
            config,
        }, "Error while updating data types")
        return Promise.reject(reason);
    })
    logger.debug("Sent data types request")

    await state.stream.requests.send(
        TransferRequest.create({
                data: {
                    oneofKind: "logon",
                    logon: {
                        actionIdentifier: config.actionId,
                        version: config.version,
                        actionConfigurations: state.configurationDefinitions
                    }
                }
            }
        ),
    ).catch(reason => {
        logger.error({
            err: reason,
            config,
        }, "Failed to send logon request")
        return Promise.reject(reason);
    })

    logger.debug("Successfully sent logon request")

    const runtimeFunctionDefinitionClient = new RuntimeFunctionDefinitionServiceClient(state.transport)
    await runtimeFunctionDefinitionClient.update(
        RuntimeFunctionDefinitionUpdateRequest.create(
            {
                runtimeFunctions: [
                    ...state.runtimeFunctions.map(func => ({
                        ...func.definition,
                    }))
                ]
            }
        ), builtOptions
    ).then(value => {
        if (!value.response.success) {
            logger.error({
                err: value.response,
                request: value.request,
                config,
            })
            return Promise.reject(value.response);
        }
    })
    logger.debug("Successfully updated runtime function definitions")

    // const FunctionDefinitionClient = new FunctionDefinitionServiceClient(state.transport)
    // try {
    //     const finishedCall = await FunctionDefinitionClient.update(
    //         FunctionDefinitionUpdateRequest.create(
    //             {
    //                 functions: [
    //                     ...state.functions.map(func => ({
    //                         ...func.definition,
    //                     }))
    //                 ]
    //             }
    //         ), builtOptions
    //     );
    //
    //     if (!finishedCall.response.success) {
    //         logger.error({
    //             err: finishedCall.response,
    //             request: finishedCall.request,
    //             config,
    //         }, "Error while updating function definitions")
    //         return Promise.reject(finishedCall.response);
    //     }
    // } catch (error) {
    //     logger.error({
    //         err: error,
    //         config,
    //     }, "Error while updating function definitions")
    //     return Promise.reject(error);
    // }
    // logger.debug("Updated function definitions")

    const flowTypeClient = new FlowTypeServiceClient(state.transport)
    await flowTypeClient.update(FlowTypeUpdateRequest.create({
        flowTypes: [
            ...state.flowTypes
        ]
    }), builtOptions).then(value => {
        if (!value.response.success) {
            logger.error({
                err: value.response,
                request: value.request,
                config,
            })
            return Promise.reject(value.response);
        }
    })
    logger.info("Connected successfully to aquila")


    return new Promise(async (resolve, reject) => {
        try {
            for await (let message of state?.stream?.responses || []) {
                logger.debug({
                    message: message,
                    config,
                }, "Received message from stream")
                switch (message?.data.oneofKind) {
                    case "actionConfigurations": {
                        logger.info("Received action configurations")

                        const configs = message.data.actionConfigurations as ActionConfigurations;
                        state.projectConfigurations = configs.actionConfigurations
                        resolve(state.projectConfigurations.map(value => {
                            return {
                                projectId: value.projectId,
                                configValues: value.actionConfigurations.map(value => {
                                    return {
                                        identifier: value.identifier,
                                        value: toAllowedValue(value.value || constructValue(null)),
                                    }
                                }),
                                findConfig: identifier => {
                                    const config = value.actionConfigurations.find(config => config.identifier === identifier);
                                    return config ? toAllowedValue(config.value || constructValue(null)) : undefined;
                                }
                            }
                        }));
                        state.fullyConnected = true
                        break;
                    }
                    case "execution": {
                        logger.info({
                            executionD: message.data.execution.executionIdentifier,
                            config,
                        }, "Handling execution request")

                        logger.debug({
                            message: message,
                            config,
                        }, "Handling execution request")
                        handleExecutionRequest(state, message)
                        break;
                    }
                }
            }
        } catch (reason) {
            logger.error({
                err: reason,
                config
            }, "Error occurred in stream")
            reject(reason);
        }
    })
}

function handleExecutionRequest(state: SdkState, message: TransferResponse) {
    if (!message.data || message.data.oneofKind !== "execution") {
        return
    }
    const execution = message.data.execution as ExecutionRequest;
    const func = state.runtimeFunctions.find(value => value.identifier == execution.functionIdentifier);

    if (!func) {
        logger.warn({
            message
        }, "Received execution request but no matching function found")
        return;
    }

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
    logger.debug({
        message,
        conf
    })

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

    if (func.handler.length == params.length + 1) {
        // handler has context parameter
        params.unshift(context)
    } else if (func.handler.length > params.length + 1) {
        logger.error({
            params,
            func,
        }, "Handler has more parameters than provided arguments")
        return;
    }

    const result = new Promise((resolve, reject) => {
        try {
            resolve(func.handler(...params))
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
        let request
        if (reason instanceof RuntimeErrorException) {
            request = TransferRequest.create({
                data: {
                    oneofKind: "result",
                    result: {
                        executionIdentifier: execution.executionIdentifier,
                        result: {
                            oneofKind: "error",
                            error: {
                                code: reason.code,
                                description: reason.description
                            }
                        },
                    }
                }
            });
        } else {
            request = TransferRequest.create({
                data: {
                    oneofKind: "result",
                    result: {
                        executionIdentifier: execution.executionIdentifier,
                        result: {
                            oneofKind: "error",
                            error: {
                                code: "UNKNOWN_ERROR",
                                description: reason.toString()
                            }
                        },
                    }
                }
            });
            logger.warn({
                err: reason,
                func,
                execution
            }, "Error occured while executing function, but not an RuntimeErrorException")
        }

        logger.debug({
            request: request
        }, "Responding with execution error")

        state.stream!.requests.send(
            request
        ).catch(reason => {
            logger.error({
                err: reason,
                request: request,
                execution,
                message
            }, "Failed to send execution result error")
        });
    })
}

export {
    createSdk,
    connect
}