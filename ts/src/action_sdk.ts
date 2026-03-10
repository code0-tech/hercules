import { GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";
import { ActionTransferServiceClient } from "@code0-tech/tucana/pb/aquila.action_pb.client.js";
import { RpcOptions } from "@protobuf-ts/runtime-rpc";
import {
    ActionConfiguration,
    ExecutionRequest,
    TransferRequest,
    TransferResponse
} from "@code0-tech/tucana/pb/aquila.action_pb.js";
import { constructValue, toAllowedValue } from "@code0-tech/tucana/helpers/shared.struct_helper.js";
import {
    ActionConfigurations,
    ActionProjectConfiguration
} from "@code0-tech/tucana/pb/shared.action_configuration_pb";
import { DataTypeServiceClient } from "@code0-tech/tucana/pb/aquila.data_type_pb.client";
import { DataTypeUpdateRequest } from "@code0-tech/tucana/pb/aquila.data_type_pb";
import { RuntimeFunctionDefinitionServiceClient } from "@code0-tech/tucana/pb/aquila.runtime_function_pb.client";
import { RuntimeFunctionDefinitionUpdateRequest } from "@code0-tech/tucana/pb/aquila.runtime_function_pb";
import { FlowTypeServiceClient } from "@code0-tech/tucana/pb/aquila.flow_type_pb.client";
import { FlowTypeUpdateRequest } from "@code0-tech/tucana/pb/aquila.flow_type_pb";
import { ActionSdk, HerculesFunctionContext, SdkState } from "./types";
import { FlowTypeSetting_UniquenessScope } from "@code0-tech/tucana/pb/shared.flow_definition_pb";


export const createSdk = (config: ActionSdk["config"]): ActionSdk => {
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
        configurationDefinitions: [],
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
            return state.projectConfigurations;
        },
        registerConfigDefinitions: async (...actionConfigurations) => {
            state.configurationDefinitions.push(...(actionConfigurations?.map(value => {
                return {
                    identifier: value.identifier,
                    name: value.name || [],
                    description: value.description || [],
                    type: value.type,
                    linkedDataTypeIdentifiers: value.linkedDataTypeIdentifiers || [],
                    defaultValue: constructValue(value.defaultValue || null),
                }
            }) || []))

            return Promise.resolve()
        },
        registerDataType: async (dataType) => {
            state.dataTypes.push({
                identifier: dataType.identifier,
                name: dataType.name || [],
                alias: dataType.alias || [],
                rules: dataType.rules || [],
                genericKeys: dataType.genericKeys || [],
                signature: dataType.signature,
                linkedDataTypeIdentifiers: dataType.linkedDataTypeIdentifiers || [],
                displayMessage: dataType.displayMessage || [],
                definitionSource: "action",
                version: dataType.version || config.version,
            });


            return Promise.resolve()
        },
        registerFlowType: async (flowType) => {
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
                inputTypeIdentifier: flowType.inputTypeIdentifier,
                returnTypeIdentifier: flowType.returnTypeIdentifier,
                settings: (flowType.settings || []).map(setting => ({
                    name: setting.name || [],
                    defaultValue: constructValue(setting.defaultValue || null),
                    identifier: setting.identifier,
                    description: setting.description || [],
                    unique: setting.unique || FlowTypeSetting_UniquenessScope.NONE,
                    dataTypeIdentifier: setting.dataTypeIdentifier
                })),
                editable: flowType.editable || false,
            });
            return Promise.resolve()
        },
        registerFunctionDefinition: async (functionDefinition, handler) => {
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
                    linkedDataTypeIdentifiers: functionDefinition.linkedDataTypeIdentifiers || [],
                    definitionSource: "action",
                    version: functionDefinition.version || config.version,
                    runtimeName: functionDefinition.runtimeName,
                    runtimeParameterDefinitions: (functionDefinition.runtimeParameterDefinitions || []).map(param => ({
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

async function connect(state: SdkState, config: ActionSdk["config"], options?: RpcOptions): Promise<ActionProjectConfiguration[]> {
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
                        resolve(state.projectConfigurations);
                        state.fullyConnected = true
                        break;
                    }
                    case "execution": {
                        await handleExecutionRequest(state, message).catch(reason => {
                            reject(reason);
                        })
                        break;
                    }
                }
            }
        } catch (reason) {
            reject(reason);
        }
    })
}

function handleExecutionRequest(state: SdkState, message: TransferResponse): Promise<void> {
    return new Promise(async (resolve, reject) => {
        if (!message.data || message.data.oneofKind !== "execution") {
            reject()
            return
        }
        const execution = message.data.execution as ExecutionRequest;
        const func = state.functions.find(value => value.identifier == execution.functionIdentifier);
        if (func) {
            const params = Object.values(execution!.parameters!.fields!).map(value => {
                return toAllowedValue(value)
            })

            const context: HerculesFunctionContext = {
                projectId: execution.projectId,
                executionId: execution.executionIdentifier,
                matchedConfigs: state.projectConfigurations.filter(config => {
                    config.projectId === execution.projectId
                }) || [],
            }

            if (func.handler.arguments.length == params.length + 1) {
                // handler has context parameter
                params.push(context)
            } else if (func.handler.arguments.length > params.length + 1) {
                reject(new Error("Handler has more parameters than provided arguments"))
                return
            }

            const result = func.handler(params.push(context))
            try {
                return await state.stream!.requests.send(
                    TransferRequest.create({
                        data: {
                            oneofKind: "result",
                            result: {
                                executionIdentifier: execution.executionIdentifier,
                                result: constructValue(result),
                            }
                        }
                    })
                );
            } catch (reason) {
                return reject(reason);
            }
        }
        resolve();
    })
}
