import type {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {constructValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import {handleExecutionRequest} from "../sdk/execution";
import {handleLogon} from "../sdk/connection/logon";
import {handleRuntimeFunctionDefinitions} from "../sdk/connection/runtimeFunctionDefinition";
import {handleFunctionDefinitions} from "../sdk/connection/functionDefinition";
import {handleFlowTypes} from "../sdk/connection/flowTypes";
import {CodeZeroAction, CodeZeroEvent} from "../index";
import {ActionTransferServiceClient} from "@code0-tech/tucana/aquila";
import {GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import {handleDataTypes} from "./dataTypeHandler";


export async function connect(action: CodeZeroAction, aquilaUrl: string, authToken: string, options?: RpcOptions): Promise<void> {
    console.debug("Trying to connect to aquila")
    action.transport = new GrpcTransport({
        host: aquilaUrl,
        channelCredentials: ChannelCredentials.createInsecure()
    })
    const actionTransferServiceClient = new ActionTransferServiceClient(action.transport!)
    const builtOptions: RpcOptions = {
        meta: {
            "authorization": authToken,
        },
        ...options
    }
    action.stream = actionTransferServiceClient.transfer(builtOptions)

    await handleDataTypes(action, builtOptions);
    await handleRuntimeFunctionDefinitions(state, builtOptions, config)
    await handleFunctionDefinitions(state, builtOptions, config)
    await handleFlowTypes(state, builtOptions, config)
    await handleLogon(state, config);

    console.info("Connected successfully to aquila")


    for await (const message of action.stream!.responses) {
        action.emit(CodeZeroEvent.streamMessageReceived, message)
        console.debug({
            message: message,
        }, "Received message from stream")
        switch (message.data.oneofKind) {
            case "actionConfigurations": {
                console.info("Received action configurations")
                action.emit(CodeZeroEvent.actionConfigurationsReceived, message.data.actionConfigurations)
                break
            }
            case "execution": {
                action.emit(CodeZeroEvent.executionRequestReceived, message.data.execution)
                break
            }
            default: {
                action.emit(CodeZeroEvent.error, new Error("Received unknown message type from stream"))
            }
        }
    }

    return new Promise(async (resolve, reject) => {
        try {
            for await (const message of state?.stream?.responses || []) {
                switch (message?.data.oneofKind) {
                    case "actionConfigurations": {
                        logger.info("Received action configurations")

                        const configs = message.data.actionConfigurations as any;
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

