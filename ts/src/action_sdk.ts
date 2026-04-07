import {GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {
    ActionSdk, HerculesActionConfigurationDefinition,
    HerculesActionProjectConfiguration, HerculesFunctionContext, SdkState, RuntimeErrorException,
    HerculesFunctionDefinition, RuntimeFunctionDefinitionClass,
    FunctionDefinitionConstructor, RegisteredRuntimeFunction, HerculesFunctionDefinitionParameter,
    HerculesRuntimeFunctionDefinitionParameter, HerculesRuntimeFunctionDefinition, RegisteredFunction
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
    FlowTypeSetting, RuntimeParameterDefinition,
} from "@code0-tech/tucana/shared";
import {constructValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import {logger} from "./logger";
import 'reflect-metadata';

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

    const buildRuntimeFunctionDefinition = (klass: RuntimeFunctionDefinitionClass): RegisteredRuntimeFunction => {
        const identifier: string = Reflect.getMetadata('hercules:identifier', klass)
        const runtimeParameters: HerculesRuntimeFunctionDefinitionParameter[] = Reflect.getMetadata('hercules:runtime_parameters', klass)
        const names: HerculesRuntimeFunctionDefinition["name"] = Reflect.getMetadata('hercules:name', klass) || []
        const displayMessage: HerculesRuntimeFunctionDefinition["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass) || []
        const description: HerculesRuntimeFunctionDefinition["description"] = Reflect.getMetadata('hercules:description', klass) || []
        const deprecationMessage: HerculesRuntimeFunctionDefinition["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass) || []
        const alias: HerculesRuntimeFunctionDefinition["alias"] = Reflect.getMetadata('hercules:alias', klass) || []
        const documentation: HerculesRuntimeFunctionDefinition["documentation"] = Reflect.getMetadata('hercules:documentation', klass) || []
        const signature: HerculesRuntimeFunctionDefinition["signature"] = Reflect.getMetadata('hercules:signature', klass)
        const linkedDataTypeIdentifiers: HerculesRuntimeFunctionDefinition["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass) || []
        const version: HerculesRuntimeFunctionDefinition["version"] = Reflect.getMetadata('hercules:version', klass) || config.version
        const displayIcon: HerculesRuntimeFunctionDefinition["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass) || ""
        const throwsError: HerculesRuntimeFunctionDefinition["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass) || false
        const runFunction = new klass().run

        if (!identifier) {
            throw new Error(`Runtime function class ${klass.name} is missing an identifier. Please add @Identifier("your_identifier") decorator to the class.`)
        }
        if (!signature) {
            throw new Error(`Runtime function class ${klass.name} is missing a signature. Please add @Signature("(param1: TYPE_1): RETURN_TYPE") decorator to the class.`)
        }

        return {
            identifier: identifier as string,
            definition: {
                alias: alias || [],
                name: names || [],
                description: description || [],
                version: version || config.version,
                runtimeName: identifier,
                deprecationMessage: deprecationMessage || [],
                displayIcon: displayIcon || "",
                displayMessage: displayMessage || [],
                documentation: documentation || [],
                linkedDataTypeIdentifiers: linkedDataTypeIdentifiers || [],
                runtimeParameterDefinitions: runtimeParameters.map(param => {
                    return {
                        ...param,
                        name: param.name || [],
                        description: param.description || [],
                        documentation: param.documentation || [],
                        hidden: param.hidden || false,
                        optional: param.optional || false,
                        defaultValue: param.defaultValue ? constructValue(param.defaultValue) : undefined,
                    } as RuntimeParameterDefinition
                }),
                signature: signature,
                throwsError: throwsError || false,
                definitionSource: "action"
            },
            handler: runFunction
        } as RegisteredRuntimeFunction
    }

    return {
        registerFunctionDefinitionClass<T>(klass: FunctionDefinitionConstructor<T>): Promise<void> {
            const parentClass = Object.getPrototypeOf(klass)
            const runtimeFunction = buildRuntimeFunctionDefinition(parentClass);
            const runtimeDefinition = runtimeFunction.definition

            const functionParameters: HerculesFunctionDefinitionParameter[] = Reflect.getMetadata('hercules:function_parameters', klass)
            const names: HerculesFunctionDefinition["name"] = Reflect.getMetadata('hercules:name', klass)
            const displayMessage: HerculesFunctionDefinition["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass)
            const description: HerculesFunctionDefinition["description"] = Reflect.getMetadata('hercules:description', klass)
            const deprecationMessage: HerculesFunctionDefinition["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass)
            const alias: HerculesFunctionDefinition["alias"] = Reflect.getMetadata('hercules:alias', klass)
            const documentation: HerculesFunctionDefinition["documentation"] = Reflect.getMetadata('hercules:documentation', klass)
            const signature: HerculesFunctionDefinition["signature"] = Reflect.getMetadata('hercules:signature', klass)
            const linkedDataTypeIdentifiers: HerculesFunctionDefinition["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass)
            const version: HerculesFunctionDefinition["version"] = Reflect.getMetadata('hercules:version', klass)
            const displayIcon: HerculesFunctionDefinition["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass)
            const throwsError: HerculesFunctionDefinition["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass)

            runtimeDefinition.runtimeParameterDefinitions.forEach(runtimeDefinition => {
                if (functionParameters.find((param: HerculesFunctionDefinitionParameter) => param.runtimeName === runtimeDefinition.runtimeName)) {
                    return;
                }
                functionParameters.push({
                    ...runtimeDefinition,
                    runtimeDefinitionName: runtimeDefinition.runtimeName
                })
            })

            state.functions.push({
                identifier: runtimeFunction.identifier,
                definition: {
                    runtimeDefinitionName: runtimeDefinition.runtimeName,
                    runtimeName: runtimeDefinition.runtimeName || runtimeDefinition.runtimeName,
                    signature: signature || runtimeDefinition.signature,
                    throwsError: throwsError || runtimeDefinition.throwsError,
                    alias: alias || runtimeDefinition.alias,
                    version: version || runtimeDefinition.version,
                    description: description || runtimeDefinition.description,
                    name: names || runtimeDefinition.name,
                    documentation: documentation || runtimeDefinition.documentation,
                    deprecationMessage: deprecationMessage || runtimeDefinition.deprecationMessage,
                    displayMessage: displayMessage || runtimeDefinition.displayMessage,
                    displayIcon: displayIcon || runtimeDefinition.displayIcon,
                    definitionSource: "action",
                    linkedDataTypeIdentifiers: linkedDataTypeIdentifiers || runtimeDefinition.linkedDataTypeIdentifiers,
                    parameterDefinitions: functionParameters.map(value => {
                        return {
                            ...value,
                            runtimeDefinitionName: value.runtimeDefinitionName || value.runtimeName,
                            name: value.name || [],
                            description: value.description || [],
                            documentation: value.documentation || [],
                            hidden: value.hidden || false,
                            optional: value.optional || false,
                            defaultValue: value.defaultValue ? constructValue(value.defaultValue || null) : undefined,
                        }
                    })
                },
            } as RegisteredFunction)

            return Promise.resolve();
        }, registerRuntimeFunctionDefinitionClass(klass: RuntimeFunctionDefinitionClass): Promise<void> {
            const omitFunctionDefinition = Reflect.getMetadata('hercules:omit_function_definition', klass) || false

            const runtimeFunction = buildRuntimeFunctionDefinition(klass);
            const definition = runtimeFunction.definition

            state.runtimeFunctions.push(runtimeFunction as RegisteredRuntimeFunction)
            if (!omitFunctionDefinition) {
                state.functions.push({
                    identifier: definition.runtimeName,
                    definition: {
                        ...definition,
                        runtimeDefinitionName: definition.runtimeName,
                        parameterDefinitions: definition.runtimeParameterDefinitions.map(param => {
                            return {
                                ...param,
                                runtimeDefinitionName: param.runtimeName
                            }
                        })
                    }
                } as RegisteredFunction)
            }

            return Promise.resolve();
        },
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

    const request = RuntimeFunctionDefinitionUpdateRequest.create(
        {
            runtimeFunctions: [
                ...state.runtimeFunctions.map(func => ({
                    ...func.definition,
                }))
            ]
        }
    );
    try {
        const runtimeFunctionDefinitionClient = new RuntimeFunctionDefinitionServiceClient(state.transport)
        await runtimeFunctionDefinitionClient.update(
            request, builtOptions
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
    } catch (error) {
        logger.debug({
            ...request.runtimeFunctions[0].runtimeParameterDefinitions[0].defaultValue
        })
        logger.error({
            err: error,
            request: request,
            config,
        }, "Error while updating runtime function definitions")
        return Promise.reject(error);
    }
    logger.debug("Successfully updated runtime function definitions")

    const FunctionDefinitionClient = new FunctionDefinitionServiceClient(state.transport)
    try {
        const finishedCall = await FunctionDefinitionClient.update(
            FunctionDefinitionUpdateRequest.create(
                {
                    functions: [
                        ...state.functions.map(func => ({
                            ...func.definition,
                        }))
                    ]
                }
            ), builtOptions
        );

        if (!finishedCall.response.success) {
            logger.error({
                err: finishedCall.response,
                request: finishedCall.request,
                config,
            }, "Error while updating function definitions")
            return Promise.reject(finishedCall.response);
        }
    } catch (error) {
        logger.error({
            err: error,
            config,
        }, "Error while updating function definitions")
        return Promise.reject(error);
    }
    logger.debug("Updated function definitions")

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