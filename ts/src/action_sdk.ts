import {FlowType} from "@code0-tech/tucana/pb/shared.flow_definition_pb.js";
import {DefinitionDataType} from "@code0-tech/tucana/pb/shared.data_type_pb.js";
import {RuntimeFunctionDefinition} from "@code0-tech/tucana/pb/shared.runtime_function_pb.js";
import {Struct, Value} from "@code0-tech/tucana/pb/shared.struct_pb.js";
import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import {ActionTransferServiceClient} from "@code0-tech/tucana/pb/aquila.action_pb.client.js";
import {DuplexStreamingCall, RpcOptions} from "@protobuf-ts/runtime-rpc";
import {ActionConfiguration, TransferRequest, TransferResponse} from "@code0-tech/tucana/pb/aquila.action_pb.js";
import {constructValue} from "@code0-tech/tucana/helpers/shared.struct_helper.js";


type ActionSdk = {
    config: {
        token: string,
        actionUrl: string,
        actionId: string,
        version: string,
    },
    connect: (options?: GrpcOptions) => Promise<void>, // after registering the functions and events
    registerActionConfiguration: (actionConfiguration: ActionConfiguration) => Promise<void>,
    registerDataType: (dataType: Omit<DefinitionDataType, "actionIdentifier">) => Promise<void>,
    registerFlowType: (flowType: Omit<FlowType, "actionIdentifier">) => Promise<void>,
    registerFunctionDefinition: (functionDefinition: Omit<RuntimeFunctionDefinition, "actionIdentifier">, handler: (parameters: Struct) => Promise<Value | void | null | undefined>) => Promise<void>,
    dispatchEvent: (eventType: string, payload: object) => Promise<void>,
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
    actionConfigurations: ActionConfiguration[],
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
        actionConfigurations: [],
        client: client,
        stream: undefined,
    }

    return {
        config,
        connect: options => {
            return connect(state, config, options);
        },
        registerActionConfiguration: async (actionConfiguration) => {
            state.actionConfigurations.push(actionConfiguration);
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
        dispatchEvent: async (eventType, payload) => {
            if (!state.stream) {
                return Promise.reject("SDK is not connected. Call connect() before dispatching events.");
            }

            return state.stream.requests.send(
                TransferRequest.create({
                    data: {
                        oneofKind: "event",
                        event: {
                            eventType: eventType,
                            payload: constructValue(payload),
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

async function connect(state: SdkState, config: ActionSdk["config"], options?: RpcOptions): Promise<void> {
    state.stream = state.client.transfer(options);

    return await state.stream.requests.send(
        TransferRequest.create({
                data: {
                    oneofKind: "configuration",
                    configuration: {
                        identifier: config.actionId,
                        version: config.version,
                        functionDefinitions: state.functions,
                        dataTypes: state.dataTypes,
                        flowTypes: state.flowTypes,
                        actionConfigurations: state.actionConfigurations
                    }
                }
            }
        )
    ).catch(reason => {
        console.error("Failed to send configuration:", reason);
        return Promise.reject(reason);
    }).then(() => {
        console.log("Configuration sent successfully");
        return Promise.resolve();
    })
}
