import {EventEmitter} from "node:events";
import {
    DefinitionDataType, Error,
    FlowType, ModuleConfigurationDefinition, ModuleProjectConfigurations, RuntimeFunctionDefinition
} from "@code0-tech/tucana/shared";
import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {
    ActionTransferRequest, ActionTransferResponse,
    ActionTransferServiceClient, DataTypeServiceClient, DataTypeUpdateRequest, ModuleServiceClient, ModuleUpdateRequest,
} from "@code0-tech/tucana/aquila";
import {DuplexStreamingCall, type RpcOptions} from "@protobuf-ts/runtime-rpc";
import {
    FunctionDefinitionClass,
    HerculesFunctionDefinition, HerculesRuntimeFunctionDefinition,
    RuntimeFunctionDefinitionClass, RuntimeFunctionDefinitionRunnable
} from "./sdk/definitions/functions/functions";
import {functionMap, runtimeFunctionMap} from "./sdk/definitions/functions/functions.mapper";
import {buildRuntimeFunctionDefinition} from "./sdk/builder/builder";
import type {
    HerculesActionConfigurationDefinition,
    HerculesTranslation,
    RegisteredFunction,
    RegisteredRuntimeFunction
} from "./types";
import {ChannelCredentials} from "@grpc/grpc-js";
import {handleDataTypes} from "./handler/dataTypeHandler";
import {handleRuntimeFunctionDefinitions} from "./sdk/connection/runtimeFunctionDefinition";
import {handleFunctionDefinitions} from "./sdk/connection/functionDefinition";
import {handleFlowTypes} from "./sdk/connection/flowTypes";
import {handleLogon} from "./sdk/connection/logon";
import {name} from "pino-pretty";
import * as console from "node:console";
import * as console from "node:console";
import {call} from "pino";
import * as console from "node:console";
import * as console from "node:console";
import * as console from "node:console";
import * as console from "node:console";

export * from "./action_sdk.js"
export * from "./types.js"

export enum CodeZeroEvent {
    error = "error",
    connected = "connected",
    streamMessageReceived = "streamMessageReceived",
    executionRequestReceived = "executionRequestReceived",
    streamMessageSent = "streamMessageSent",

    moduleUpdated = "moduleUpdated",
    moduleUpdateFailed = "moduleUpdateFailed",
}

export interface CodeZeroEventMap {
    [CodeZeroEvent.error]: [Error]
    [CodeZeroEvent.connected]: [CodeZeroAction]
    [CodeZeroEvent.streamMessageReceived]: [ActionTransferResponse]
    [CodeZeroEvent.streamMessageSent]: [ActionTransferRequest]
    [CodeZeroEvent.moduleUpdated]: [ModuleUpdateRequest]
    [CodeZeroEvent.moduleUpdateFailed]: [Error]

    [flowType: string]: any[]
}

export class CodeZeroAction extends EventEmitter<CodeZeroEventMap> {
    private _functions: HerculesFunctionDefinition[] = [];
    private _runtimeFunctions: HerculesRuntimeFunctionDefinition[] = [];
    private _dataTypes: DefinitionDataType[] = [];
    private _eventTypes: FlowType[] = [];
    private _projectConfigurations: ModuleProjectConfigurations[] = [];
    private _transport?: GrpcTransport
    private _actionTransferServiceClient?: ActionTransferServiceClient

    private _stream?: DuplexStreamingCall<ActionTransferRequest, ActionTransferResponse>

    private _identifier: string;
    private _version: string
    private _aquilaUrl?: string
    private _author: string
    private _icon: string;
    private _name: HerculesTranslation[];
    private _documentation: string;
    private _configurationDefinitions: HerculesActionConfigurationDefinition[];


    constructor(identifier: string, version: string, aquilaUrl: string, author: string, icon: string, documentation: string, name: HerculesTranslation[], configurationDefinitions: HerculesActionConfigurationDefinition[]) {
        super();
        this._identifier = identifier;
        this._version = version;
        this._aquilaUrl = aquilaUrl;
        this._author = author;
        this._icon = icon;
        this._name = name;
        this._documentation = documentation;
    }

    registerFunction<T extends RuntimeFunctionDefinitionClass>(klass: FunctionDefinitionClass<T>) {
        const functionDefinition = functionMap(klass);

        this._functions.push(functionDefinition)
    }

    registerRuntimeFunction(klass: RuntimeFunctionDefinitionClass) {
        const omitFunctionDefinition = Reflect.getMetadata('hercules:omit_function_definition', klass) || false

        const runtimeFunction = runtimeFunctionMap(klass);

        this._runtimeFunctions.push(runtimeFunction)
        if (!omitFunctionDefinition) {
            this._functions.push({
                ...runtimeFunction,
                runtimeDefinitionName: runtimeFunction.runtimeName,
                parameters: runtimeFunction.parameters?.map(param => {
                    return {
                        ...param,
                        runtimeDefinitionName: param.runtimeName
                    }
                }) || []
            })
        }
    }

    connect(authToken: string, aquilaUrl: string, author: string, grpcOptions?: GrpcOptions) {
        console.debug("Trying to connect to aquila")
        this._transport = new GrpcTransport({
            host: aquilaUrl,
            channelCredentials: ChannelCredentials.createInsecure()
        })
        const actionTransferServiceClient = new ActionTransferServiceClient(this._transport!)
        const builtOptions: RpcOptions = {
            meta: {
                "authorization": authToken,
            },
            ...grpcOptions
        }
        this._stream = actionTransferServiceClient.transfer(builtOptions)


        const moduleClient = new ModuleServiceClient(this._transport!)
        try {
            console.debug("Sent data types request")
            const call = moduleClient.update(ModuleUpdateRequest.create({
                modules: [
                    {
                        author: this._author,
                        version: this._version,
                        name: this._name,
                        icon: this._icon,
                        documentation: this._documentation,
                        identifier: this._identifier,
                        configurations: this._configurationDefinitions.map(definition => {
                            return {
                                identifier: definition.identifier,
                                name: definition.name,
                                type: definition.type,
                                hidden: definition.hidden || false,
                                defaultValue: definition.defaultValue,
                                description: definition.description,
                                optional: definition.optional || false,
                                linkedDataTypeIdentifiers: definition.linkedDataTypes
                            } as ModuleConfigurationDefinition
                        })

                    }
                ]
            }), grpcOptions)
            if (!call.response.success) {
                action.emit(CodeZeroEvent.dataTypesUpdateFailed, new Error("Failed to update data types"))
                return Promise.reject(call.response);
            }
            action.emit(CodeZeroEvent.dataTypesUpdated, call.response)
        } catch (error) {
            console.error({
                err: error,
            }, "Error while updating data types")
            return Promise.reject(error);
        }

        // await handleDataTypes(action, builtOptions);
        // await handleRuntimeFunctionDefinitions(state, builtOptions, config)
        // await handleFunctionDefinitions(state, builtOptions, config)
        // await handleFlowTypes(state, builtOptions, config)
        // await handleLogon(state, config);

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
    }
}
