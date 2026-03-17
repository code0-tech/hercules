export * from "./types";
export * from "@code0-tech/tucana/shared";
export * from "@code0-tech/tucana/aquila";
import {GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {
    ActionSdk, HerculesActionConfigurationDefinition,
    HerculesActionProjectConfiguration, HerculesFunctionContext, SdkState, RuntimeErrorException
} from "./types";
import {
    ActionTransferServiceClient,
    DataTypeServiceClient,
    DataTypeUpdateRequest, ExecutionRequest,
    FlowTypeServiceClient,
    FlowTypeUpdateRequest, RuntimeFunctionDefinitionServiceClient, RuntimeFunctionDefinitionUpdateRequest,
    TransferRequest, TransferResponse
} from "@code0-tech/tucana/aquila";
import {
    ActionConfigurations,
    FlowTypeSetting,
    FlowTypeSetting_UniquenessScope,
    toAllowedValue,
    constructValue, PlainValue
} from "@code0-tech/tucana/shared";

export const createSdk = (config: ActionSdk["config"], configDefinitions?: HerculesActionConfigurationDefinition[]): ActionSdk => {
    const transport = new GrpcTransport(
        {
            host: config.aquilaUrl,
            channelCredentials: ChannelCredentials.createInsecure()
        }
    )
    const client = new ActionTransferServiceClient(transport);

    const state: SdkState = {
        functions: [],
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
                    identifier: flowType.identifier,
                    name: flowType.name || [],
                    alias: flowType.alias || [],
                    description: flowType.description || [],
                    displayIcon: flowType.displayIcon || "",
                    displayMessage: flowType.displayMessage || [],
                    documentation: flowType.documentation || [],
                    definitionSource: "action",
                    version: flowType.version || config.version,
                    inputType: flowType.inputType || "",
                    returnType: flowType.returnType || "",
                    linkedDataTypeIdentifiers: flowType.linkedDataTypes || [],
                    settings: (flowType.settings || []).map(setting => ({
                        name: setting.name || [],
                        defaultValue: constructValue(setting.defaultValue || null),
                        identifier: setting.identifier,
                        description: setting.description || [],
                        unique: setting.unique || FlowTypeSetting_UniquenessScope.NONE,
                        type: setting.type,
                        linkedDataTypeIdentifiers: setting.linkedDataTypeIdentifiers || [],
                    } as FlowTypeSetting)),
                    editable: flowType.editable || false
                });
            })
            return Promise.resolve()
        },
        registerFunctionDefinitions: async (...functionDefinitions) => {
            for (const registeredFunction of functionDefinitions) {
                const handler = registeredFunction.handler;
                const functionDefinition = registeredFunction.definition;
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
        return Promise.reject(reason);
    })


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
        return Promise.reject(reason);
    })

    const runtimeFunctionDefinitionClient = new RuntimeFunctionDefinitionServiceClient(state.transport)
    await runtimeFunctionDefinitionClient.update(
        RuntimeFunctionDefinitionUpdateRequest.create(
            {
                runtimeFunctions: [
                    ...state.functions.map(func => ({
                        ...func.definition,
                    }))
                ]
            }
        ), builtOptions
    ).then(value => {
        if (!value.response.success) {
            return Promise.reject(value.response);
        }
    })

    const flowTypeClient = new FlowTypeServiceClient(state.transport)
    await flowTypeClient.update(FlowTypeUpdateRequest.create({
        flowTypes: [
            ...state.flowTypes
        ]
    }), builtOptions).then(value => {
        if (!value.response.success) {
            return Promise.reject(value.response);
        }
    })


    return new Promise(async (resolve, reject) => {
        try {
            for await (let message of state?.stream?.responses || []) {
                switch (message?.data.oneofKind) {
                    case "actionConfigurations": {
                        const configs = message.data.actionConfigurations as ActionConfigurations;
                        console.log("Received action configurations:", configs);
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
                        handleExecutionRequest(state, message)
                        break;
                    }
                }
            }
        } catch (reason) {
            reject(reason);
        }
    })
}

function handleExecutionRequest(state: SdkState, message: TransferResponse) {
    if (!message.data || message.data.oneofKind !== "execution") {
        return
    }
    const execution = message.data.execution as ExecutionRequest;
    const func = state.functions.find(value => value.identifier == execution.functionIdentifier);
    if (func) {
        const params = Object.entries(execution.parameters!.fields!).map(([key, value]) => {
            const param = func.definition.runtimeParameterDefinitions
                .find(p => p.runtimeName === key);

            return param ? toAllowedValue(value) : undefined;
        });
        const conf = state.projectConfigurations.find(config => {
            return true
        })
        if (!conf) {
            console.error(`No configuration found for project ${execution.projectId}`)
            return;
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

        if (func.handler.length == params.length + 1) {
            // handler has context parameter
            params.unshift(context)
        } else if (func.handler.length > params.length + 1) {
            console.error("Handler has more parameters than provided arguments. This may lead to unexpected behavior.")
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
            state.stream!.requests.send(
                TransferRequest.create({
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
                })
            ).catch(reason => {
                console.error(`Failed to send execution result for execution ${execution.executionIdentifier}:`, reason);
            });
        }).catch(reason => {
            if (reason instanceof RuntimeErrorException) {
                state.stream!.requests.send(
                    TransferRequest.create({
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
                    })
                ).catch(reason => {
                    console.error(`Failed to send execution result for execution ${execution.executionIdentifier}:`, reason);
                });

            } else {
                console.error(`Error executing function ${func?.identifier} for execution ${execution.executionIdentifier}:`, reason);
            }
        })


    }
}