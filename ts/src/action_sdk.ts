import { FlowType } from "@code0-tech/tucana/pb/shared.flow_definition_pb.js";
import { DefinitionDataType } from "@code0-tech/tucana/pb/shared.data_type_pb.js";
import { RuntimeFunctionDefinition } from "@code0-tech/tucana/pb/shared.runtime_function_pb.js";
import { Struct, Value } from "@code0-tech/tucana/pb/shared.struct_pb.js";
import { GrpcOptions, GrpcTransport } from "@protobuf-ts/grpc-transport";
import { ChannelCredentials } from "@grpc/grpc-js";
import { ActionTransferServiceClient } from "@code0-tech/tucana/pb/aquila.action_pb.client.js";
import { DuplexStreamingCall, MethodInfo, NextUnaryFn, RpcOptions, UnaryCall } from "@protobuf-ts/runtime-rpc";
import { ExecutionRequest, TransferRequest, TransferResponse } from "@code0-tech/tucana/pb/aquila.action_pb.js";
import { constructValue } from "@code0-tech/tucana/helpers/shared.struct_helper.js";
import {
    ActionConfigurationDefinition, ActionConfigurations,
    ActionProjectConfiguration
} from "@code0-tech/tucana/pb/shared.action_configuration_pb";
import { DataTypeServiceClient } from "@code0-tech/tucana/pb/aquila.data_type_pb.client";
import { DataTypeUpdateRequest } from "@code0-tech/tucana/pb/aquila.data_type_pb";
import { RuntimeFunctionDefinitionServiceClient } from "@code0-tech/tucana/pb/aquila.runtime_function_pb.client";
import { RuntimeFunctionDefinitionUpdateRequest } from "@code0-tech/tucana/pb/aquila.runtime_function_pb";
import { FlowTypeServiceClient } from "@code0-tech/tucana/pb/aquila.flow_type_pb.client";
import { FlowTypeUpdateRequest } from "@code0-tech/tucana/pb/aquila.flow_type_pb";

type ActionSdk = {
    config: {
        token: string,
        actionUrl: string,
        actionId: string,
        version: string,
    },
    connect: (options?: GrpcOptions) => Promise<ActionProjectConfiguration[]>, // after registering the functions and events
    getProjectActionConfigurations(): ActionProjectConfiguration[],
    registerConfigDefinitions: (...actionConfigurations: ActionConfigurationDefinition[]) => Promise<void>,
    registerDataType: (dataType: Omit<DefinitionDataType, "actionIdentifier">) => Promise<void>,
    registerFlowType: (flowType: Omit<FlowType, "actionIdentifier">) => Promise<void>,
    registerFunctionDefinition: (functionDefinition: Omit<RuntimeFunctionDefinition, "actionIdentifier">, handler: (parameters: Struct) => Promise<Value | void | null | undefined>) => Promise<void>,
    dispatchEvent: (eventType: string, projectId: number | bigint, payload: Value) => Promise<void>,
}

type RegisteredFunction = {
    identifier: string,
    definition: Omit<RuntimeFunctionDefinition, "actionIdentifier">,
    handler: (parameters: Struct) => Promise<Value | void | null | undefined>,
}

type SdkState = {
    functions: RegisteredFunction[],
    dataTypes: DefinitionDataType[],
    flowTypes: FlowType[],
    configurationDefinitions: ActionConfigurationDefinition[],
    projectConfigurations: ActionProjectConfiguration[],
    transport: GrpcTransport,
    client: ActionTransferServiceClient,
    stream: DuplexStreamingCall<TransferRequest, TransferResponse> | undefined,
}

export const createSdk = (config: ActionSdk["config"]): ActionSdk => {
    const transport = new GrpcTransport(
        {
            host: config.actionUrl,
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
    }

    return {
        config,
        connect: options => {
            return connect(state, config, options);
        },
        getProjectActionConfigurations: () => {
            return state.projectConfigurations;
        },
        registerConfigDefinitions: async (actionConfigurations) => {
            state.configurationDefinitions = state.configurationDefinitions.concat(actionConfigurations);
            return Promise.resolve()
        },
        registerDataType: async (dataType) => {
            state.dataTypes.push(dataType);
            return Promise.resolve()
        },
        registerFlowType: async (flowType) => {
            state.flowTypes.push(flowType);
            return Promise.resolve()
        },
        registerFunctionDefinition: async (functionDefinition, handler) => {
            state.functions.push({
                identifier: functionDefinition.runtimeName,
                definition: functionDefinition,
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
                            payload: payload || constructValue(null),
                        }
                    }
                })
            ).catch(reason => {
                console.error("Failed to dispatch event:", reason);
                return Promise.reject(reason);
            }).then(() => {
                console.log("Event dispatched successfully");
                return Promise.resolve();
            })
        }
    }
}

async function connect(state: SdkState, config: ActionSdk["config"], options?: RpcOptions): Promise<ActionProjectConfiguration[]> {
    state.stream = state.client.transfer({
        meta: {
            "Authorization": config.token,
        },
        ...options
    });

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
        console.error("Failed to send logon request:", reason);
        return Promise.reject(reason);
    }).then(() => {
        console.log("Logon request sent successfully");
    }
    )

    const dataTypeClient = new DataTypeServiceClient(state.transport)
    await dataTypeClient.update(DataTypeUpdateRequest.create({
        dataTypes: [
            ...state.dataTypes
        ]
    })).then(value => {
        if (value.response.success) {
            console.log("Data types updated successfully");
        } else {
            console.error("Failed to update data types:", value.response);
            return Promise.reject("Failed to update data types");
        }
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
        )
    ).then(value => {
        if (value.response.success) {
            console.log("Runtime functions updated successfully");
        } else {
            console.error("Failed to update runtime functions:", value.response);
            return Promise.reject("Failed to update runtime functions");
        }
    })

    const flowTypeClient = new FlowTypeServiceClient(state.transport)
    await flowTypeClient.update(FlowTypeUpdateRequest.create({
        flowTypes: [
            ...state.flowTypes
        ]
    })).then(value => {
        if (value.response.success) {
            console.log("Flow types updated successfully");
        } else {
            console.error("Failed to update flow types:", value.response);
            return Promise.reject("Failed to update flow types");
        }
    })


    return new Promise((resolve, reject) => {
        state?.stream?.responses?.onError(reason => {
            console.error("Stream error:", reason);
            reject(reason);
        })
        state?.stream?.responses?.onComplete(() => {
            console.log("Stream completed by server");
            reject("Stream completed by server");
        })
        state?.stream?.responses?.onNext(message => {
            switch (message?.data.oneofKind) {
                case "actionConfigurations": {
                    const configs = message.data.actionConfigurations as ActionConfigurations;
                    console.log("Received action configurations:", configs);
                    state.projectConfigurations = configs.actionConfigurations
                    resolve(state.projectConfigurations);
                    break;
                }
                case "execution": {
                    const execution = message.data.execution as ExecutionRequest;
                    const func = state.functions.find(value => value.identifier == execution.functionIdentifier);
                    if (func) {
                        func.handler(execution.parameters!).then(async value => {
                            try {
                                console.log("Execution result:", value);
                                return await state.stream!.requests.send(
                                    TransferRequest.create({
                                        data: {
                                            oneofKind: "result",
                                            result: {
                                                executionIdentifier: execution.executionIdentifier,
                                                result: value || constructValue(null),
                                            }
                                        }
                                    })
                                );
                            } catch (reason) {
                                console.error("Failed to send execution result:", reason);
                                return await Promise.reject(reason);
                            }
                        })
                    }
                    break;
                }
            }
        }
        )

    })
}


