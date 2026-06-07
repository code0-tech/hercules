import {EventEmitter} from "node:events";
import {RegisteredFunction, RegisteredRuntimeFunction} from "./types";
import {
    ActionConfigurationDefinition,
    ActionProjectConfiguration,
    DefinitionDataType,
    FlowType
} from "@code0-tech/tucana/shared";
import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {
    ActionTransferServiceClient,
    DataTypeUpdateResponse,
    TransferRequest,
    TransferResponse
} from "@code0-tech/tucana/aquila";
import {DuplexStreamingCall} from "@protobuf-ts/runtime-rpc";
import {ChannelCredentials} from "@grpc/grpc-js";

export * from "./action_sdk.js"
export * from "./types.js"

export enum CodeZeroEvent {
    error = "error",
    connected = "connected",
    streamMessageReceived = "streamMessageReceived",
    actionConfigurationsReceived = "actionConfigurationsReceived",
    executionRequestReceived = "executionRequestReceived",

    streamMessageSent = "streamMessageSent",
    dataTypesUpdated = "dataTypesUpdated",
    dataTypesUpdateFailed = "dataTypesUpdateFailed",
}

export interface CodeZeroEventMap {
    [CodeZeroEvent.error]: [Error]
    [CodeZeroEvent.connected]: [CodeZeroAction]
    [CodeZeroEvent.streamMessageReceived]: [TransferResponse]
    [CodeZeroEvent.dataTypesUpdated]: [DataTypeUpdateResponse]
    [CodeZeroEvent.dataTypesUpdateFailed]: [Error]
    [CodeZeroEvent.streamMessageSent]: [TransferRequest]
    [flowType: string]: any[]
}

export class CodeZeroAction extends EventEmitter<CodeZeroEventMap> {
    private _version: string
    private _functions: RegisteredFunction[] = [];
    private _runtimeFunctions: RegisteredRuntimeFunction[] = [];
    private _dataTypes: DefinitionDataType[] = [];
    private _eventTypes: FlowType[] = [];
    private _configurationDefinitions: ActionConfigurationDefinition[] = [];
    private _projectConfigurations: ActionProjectConfiguration[] = [];

    private _transport?: GrpcTransport
    private _actionTransferServiceClient?: ActionTransferServiceClient
    private _stream?: DuplexStreamingCall<TransferRequest, TransferResponse>


    constructor(version: string) {
        super()
        this._version = version
    }


    set functions(value: RegisteredFunction[]) {
        this._functions = value;
    }

    set runtimeFunctions(value: RegisteredRuntimeFunction[]) {
        this._runtimeFunctions = value;
    }

    set dataTypes(value: DefinitionDataType[]) {
        this._dataTypes = value;
    }

    set eventTypes(value: FlowType[]) {
        this._eventTypes = value;
    }

    set configurationDefinitions(value: ActionConfigurationDefinition[]) {
        this._configurationDefinitions = value;
    }

    set projectConfigurations(value: ActionProjectConfiguration[]) {
        this._projectConfigurations = value;
    }

    get version(): string {
        return this._version;
    }

    get functions(): RegisteredFunction[] {
        return this._functions;
    }

    get runtimeFunctions(): RegisteredRuntimeFunction[] {
        return this._runtimeFunctions;
    }

    get dataTypes(): DefinitionDataType[] {
        return this._dataTypes;
    }

    get eventTypes(): FlowType[] {
        return this._eventTypes;
    }

    get configurationDefinitions(): ActionConfigurationDefinition[] {
        return this._configurationDefinitions;
    }

    get projectConfigurations(): ActionProjectConfiguration[] {
        return this._projectConfigurations;
    }

    get transport(): GrpcTransport | undefined {
        return this._transport;
    }

    get actionTransferServiceClient(): ActionTransferServiceClient | undefined {
        return this._actionTransferServiceClient;
    }

    get stream(): DuplexStreamingCall<TransferRequest, TransferResponse> | undefined {
        return this._stream;
    }

    set transport(value: GrpcTransport) {
        this._transport = value;
    }

    set actionTransferServiceClient(value: ActionTransferServiceClient) {
        this._actionTransferServiceClient = value;
    }

    set stream(value: DuplexStreamingCall<TransferRequest, TransferResponse>) {
        this._stream = value;
    }

    connect(authToken: string, aquilaUrl: string, identifier: string, grpcOptions?: GrpcOptions) {

    }
}
