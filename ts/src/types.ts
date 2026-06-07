import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {DuplexStreamingCall} from "@protobuf-ts/runtime-rpc";
import {
    DefinitionDataType,
    DefinitionDataTypeRule, FlowType,
    FlowTypeSetting_UniquenessScope, FunctionDefinition,
    RuntimeFunctionDefinition
} from "@code0-tech/tucana/shared";
import {PlainValue} from "@code0-tech/tucana/helpers";
import 'reflect-metadata';
import {FunctionDefinitionClass, RuntimeFunctionDefinitionClass} from "./sdk/definitions/functions/functions";

export interface HerculesTranslation {
    code: "en-US" | "de-DE" | string,
    content: string
}

export interface HerculesFunctionContext {
    projectId: number | bigint,
    executionId: string,
    matchedConfig: HerculesActionProjectConfiguration
}

export interface HerculesDataType {
    identifier: string,
    name?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
    rules?: DefinitionDataTypeRule[],
    genericKeys?: string[],
    type: string,
    linkedDataTypes?: string[]
}

export interface HerculesEventTypeSetting {
    identifier: string,
    unique?: FlowTypeSetting_UniquenessScope,
    linkedDataTypeIdentifiers?: string[],
    defaultValue?: PlainValue,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
}

export interface HerculesEventType {
    identifier: string,
    settings?: HerculesEventTypeSetting[],
    signature: string,
    linkedDataTypes?: string[],
    editable: boolean,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
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
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    type: string,
    hidden: boolean,
    optional: boolean,
    linkedDataTypes?: string[],
    defaultValue?: PlainValue,
    identifier: string,
}

// export type HerculesRegisterRuntimeFunctionParameter = {
//     definition: HerculesRuntimeFunctionDefinition,
//     handler: (...args: any[]) => Promise<PlainValue> | PlainValue,
// }

// export interface ActionSdk {
//     config: {
//         authToken: string,
//         aquilaUrl: string,
//         actionId: string,
//         version: string,
//     },
//     fullyConnected: () => boolean, // indicates whether the SDK is fully connected and ready to send/receive messages. Becomes true after connect() resolves successfully
//     connect: (options?: GrpcOptions) => Promise<HerculesActionProjectConfiguration[]>, // after registering the functions and events
//     onError: (handler: (error: Error) => void) => void,
//
//     getProjectActionConfigurations(): HerculesActionProjectConfiguration[],
//
//     registerConfigDefinitions: (...actionConfigurations: Array<HerculesActionConfigurationDefinition>) => Promise<void>,
//     registerDataTypes: (...dataType: Array<HerculesDataType>) => Promise<void>,
//     registerEventTypes: (...flowTypes: Array<HerculesEventType>) => Promise<void>,
//     registerRuntimeFunctionDefinitionClass: (klass: RuntimeFunctionDefinitionClass) => Promise<void>,
//     registerFunctionDefinitionClass: <T extends RuntimeFunctionDefinitionClass>(klass: FunctionDefinitionClass<T>) => Promise<void>,
//     dispatchEvent: (eventType: string, projectId: number | bigint, payload: PlainValue) => Promise<void>,
// }

export class RuntimeErrorException extends Error {
    code: string
    description?: string

    constructor(code: string, description?: string) {
        super(`Runtime error with code ${code} occurred. ${description ? `Description: ${description}` : ""}`);
        this.name = "RuntimeErrorException";
        this.code = code;
        this.description = description
    }
}

//
// export interface RegisteredFunction {
//     identifier: string,
//     definition: FunctionDefinition
// }
//
// export interface RegisteredRuntimeFunction {
//     identifier: string,
//     definition: RuntimeFunctionDefinition,
// }
//
// export interface SdkState {
//     functions: RegisteredFunction[],
//     runtimeFunctions: RegisteredRuntimeFunction[],
//     dataTypes: DefinitionDataType[],
//     flowTypes: FlowType[],
//     configurationDefinitions: ActionConfigurationDefinition[],
//     projectConfigurations: ActionProjectConfiguration[],
//     transport: GrpcTransport,
//     client: ActionTransferServiceClient,
//     stream: DuplexStreamingCall<TransferRequest, TransferResponse> | undefined,
//     fullyConnected: boolean,
// }