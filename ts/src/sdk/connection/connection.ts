import type {RpcOptions} from "@protobuf-ts/runtime-rpc";
import {logger} from "../../logger";
import {constructValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import type {
    ActionSdk,
    SdkState,
    HerculesActionProjectConfiguration
} from "../../types";
import {handleExecutionRequest} from "../execution";
import {handleLogon} from "./logon";
import {handleRuntimeFunctionDefinitions} from "./runtimeFunctionDefinition";
import {handleDataTypes} from "./dataType";
import {handleFunctionDefinitions} from "./functionDefinition";
import {handleFlowTypes} from "./flowTypes";


export async function connect(state: SdkState, config: ActionSdk["config"], options?: RpcOptions): Promise<HerculesActionProjectConfiguration[]> {
    logger.debug("Trying to connect to aquila")
    const builtOptions: RpcOptions = {
        meta: {
            "authorization": config.authToken,
        },
        ...options
    }
    state.stream = state.client.transfer(builtOptions);

    await handleDataTypes(state, builtOptions, config);
    await handleRuntimeFunctionDefinitions(state, builtOptions, config)
    await handleFunctionDefinitions(state, builtOptions, config)
    await handleFlowTypes(state, builtOptions, config)
    await handleLogon(state, config);

    logger.info("Connected successfully to aquila")


    return new Promise(async (resolve, reject) => {
        try {
            for await (const message of state?.stream?.responses || []) {
                logger.debug({
                    message: message,
                    config,
                }, "Received message from stream")
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

