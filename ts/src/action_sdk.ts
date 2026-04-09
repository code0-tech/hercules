import {GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ChannelCredentials} from "@grpc/grpc-js";
import type {ActionSdk, HerculesActionConfigurationDefinition, SdkState} from "./types.js";
import {ActionTransferServiceClient, TransferRequest} from "@code0-tech/tucana/aquila";
import {FlowTypeSetting,} from "@code0-tech/tucana/shared";
import {constructValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import 'reflect-metadata';
import {connect as connectHelper} from "./sdk/connection/connection";
import {registerFunctionDefinitionClass} from "./sdk/builder/registerFunctionDefinitionClass";
import {registerRuntimeFunctionDefinitionClass} from "./builder/registerRuntimeFunctionDefinitionClass";


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

    return {
        registerFunctionDefinitionClass: registerFunctionDefinitionClass(config, state),
        registerRuntimeFunctionDefinitionClass: registerRuntimeFunctionDefinitionClass(config, state),
        fullyConnected(): boolean {
            return state.fullyConnected;
        },
        config,
        onError: handler => {
            state.stream?.responses.onError(handler)
        },
        connect: options => {
            return connectHelper(state, config, options);
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
                    displayIcon: flowType.displayIcon || "tabler:note",
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

export {
    createSdk,
    connectHelper as connect
}