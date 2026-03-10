import {FlowType} from "@code0-tech/tucana/pb/shared.flow_definition_pb.js";
import {DefinitionDataType} from "@code0-tech/tucana/pb/shared.data_type_pb.js";
import {RuntimeFunctionDefinition} from "@code0-tech/tucana/pb/shared.runtime_function_pb.js";
import {Struct, Value} from "@code0-tech/tucana/pb/shared.struct_pb.js";
import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import {ActionTransferServiceClient} from "@code0-tech/tucana/pb/aquila.action_pb.client.js";
import {DuplexStreamingCall, RpcOptions} from "@protobuf-ts/runtime-rpc";
import {ExecutionRequest, TransferRequest, TransferResponse} from "@code0-tech/tucana/pb/aquila.action_pb.js";
import {constructValue} from "@code0-tech/tucana/helpers/shared.struct_helper.js";
import {
    ActionConfigurationDefinition, ActionConfigurations,
    ActionProjectConfiguration
} from "@code0-tech/tucana/pb/shared.action_configuration_pb.js";
import {DataTypeServiceClient} from "@code0-tech/tucana/pb/aquila.data_type_pb.client.js";
import {DataTypeUpdateRequest} from "@code0-tech/tucana/pb/aquila.data_type_pb.js";
import {RuntimeFunctionDefinitionServiceClient} from "@code0-tech/tucana/pb/aquila.runtime_function_pb.client.js";
import {RuntimeFunctionDefinitionUpdateRequest} from "@code0-tech/tucana/pb/aquila.runtime_function_pb.js";
import {FlowTypeServiceClient} from "@code0-tech/tucana/pb/aquila.flow_type_pb.client.js";
import {FlowTypeUpdateRequest} from "@code0-tech/tucana/pb/aquila.flow_type_pb.js";

type ActionSdk = {
    config: {
        token: string,
        actionUrl: string,
        actionId: string,
        version: string,
    },
    fullyConnected: () => boolean, // indicates whether the SDK is fully connected and ready to send/receive messages. Becomes true after connect() resolves successfully
    connect: (options?: GrpcOptions) => Promise<ActionProjectConfiguration[]>, // after registering the functions and events
    onError: (handler: (error: Error) => void) => void,
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
    fullyConnected: boolean,
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
                return Promise.reject(reason);
            }).then(() => {
                return Promise.resolve();
            })
        }
    }
}

async function  connect(state: SdkState, config: ActionSdk["config"], options?: RpcOptions): Promise<ActionProjectConfiguration[]> {
    const builtOptions: RpcOptions = {
        meta: {
            "Authorization": config.token,
        },
        ...options
    }
    state.stream = state.client.transfer(builtOptions);

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
                    return reject(reason);
                }
            })
        }
        resolve();
    })
}
