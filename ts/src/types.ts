import {FlowType, FlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/pb/shared.flow_definition_pb.js";
import {DefinitionDataType, DefinitionDataTypeRule} from "@code0-tech/tucana/pb/shared.data_type_pb.js";
import {RuntimeFunctionDefinition} from "@code0-tech/tucana/pb/shared.runtime_function_pb.js";
import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ActionTransferServiceClient} from "@code0-tech/tucana/pb/aquila.action_pb.client.js";
import {DuplexStreamingCall} from "@protobuf-ts/runtime-rpc";
import {
    TransferRequest,
    TransferResponse
} from "@code0-tech/tucana/pb/aquila.action_pb.js";
import {
    ActionConfigurationDefinition, ActionProjectConfiguration
} from "@code0-tech/tucana/pb/shared.action_configuration_pb";
import {Translation} from "@code0-tech/tucana/pb/shared.translation_pb";
import {PlainValue} from "@code0-tech/tucana/helpers/shared.struct_helper";

export interface HerculesFunctionContext {
    projectId: number | bigint,
    executionId: string,
    matchedConfig: HerculesActionProjectConfiguration
}

export interface HerculesDefinitionDataType {
    identifier: string,
    name?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    rules?: DefinitionDataTypeRule[],
    genericKeys?: string[],
    type: string,
    linkedDataTypeIdentifiers?: string[],
    // Will default to sdk version
    version?: string
}

export interface HerculesFlowTypeSetting {
    identifier: string,
    unique?: FlowTypeSetting_UniquenessScope,
    dataTypeIdentifier: string,
    linkedDataTypeIdentifiers?: string[],
    defaultValue?: PlainValue,
    name?: Translation[],
    description?: Translation[],
}

export interface HerculesFlowType {
    identifier: string,
    settings?: HerculesFlowTypeSetting[]
    inputType?: string,
    returnType?: string,
    linkedDataTypeIdentifiers?: string[],
    editable: boolean,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    version?: string,
    displayIcon?: string,
}

export interface HerculesRuntimeFunctionDefinition {
    runtimeName: string,
    parameters?: {
        runtimeName: string,
        defaultValue?: PlainValue,
        name?: Translation[],
        description?: Translation[],
        documentation?: Translation[],
    }[],
    signature: string,
    throwsError?: boolean,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    deprecationMessage?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    linkedDataTypeIdentifiers?: string[],
    version?: string,
    displayIcon?: string,
}

export interface HerculesActionProjectConfiguration {
    projectId: number | bigint,
    configValues: {
        identifier: string,
        value: PlainValue
    }[],
    findConfig: (identifier: string) => PlainValue | undefined
}

export interface HerculesActionConfigurationDefinition {
    name?: Translation[],
    description?: Translation[],
    type: string,
    linkedDataTypeIdentifiers?: string[],
    defaultValue?: PlainValue,
    identifier: string,
}

export interface ActionSdk {
    config: {
        authToken: string,
        aquilaUrl: string,
        actionId: string,
        version: string,
    },
    fullyConnected: () => boolean, // indicates whether the SDK is fully connected and ready to send/receive messages. Becomes true after connect() resolves successfully
    connect: (options?: GrpcOptions) => Promise<HerculesActionProjectConfiguration[]>, // after registering the functions and events
    onError: (handler: (error: Error) => void) => void,

    getProjectActionConfigurations(): HerculesActionProjectConfiguration[],

    registerConfigDefinitions: (...actionConfigurations: Array<HerculesActionConfigurationDefinition>) => Promise<void>,
    registerDataType: (...dataType: Array<HerculesDefinitionDataType>) => Promise<void>,
    registerFlowType: (flowType: HerculesFlowType) => Promise<void>,
    registerFunctionDefinition: (functionDefinition: HerculesRuntimeFunctionDefinition, handler: (...args: any[]) => PlainValue | Promise<PlainValue>) => Promise<void>,
    dispatchEvent: (eventType: string, projectId: number | bigint, payload: PlainValue) => Promise<void>,
}

export class RuntimeErrorException extends Error {
    details?: string[];

    constructor(message: string, details?: string[]) {
        super(message);
        this.name = "RuntimeErrorException";
        this.details = details;
    }
}

export interface RegisteredFunction {
    identifier: string,
    definition: RuntimeFunctionDefinition,
    handler: (...args: any[]) => Promise<PlainValue> | PlainValue,
}

export interface SdkState {
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