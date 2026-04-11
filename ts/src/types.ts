import {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {DuplexStreamingCall} from "@protobuf-ts/runtime-rpc";
import {
    ActionConfigurationDefinition, ActionProjectConfiguration,
    DefinitionDataType,
    DefinitionDataTypeRule, FlowType,
    FlowTypeSetting_UniquenessScope, FunctionDefinition,
    RuntimeFunctionDefinition
} from "@code0-tech/tucana/shared";
import {PlainValue} from "@code0-tech/tucana/helpers";
import {ActionTransferServiceClient, TransferRequest, TransferResponse} from "@code0-tech/tucana/aquila";
import 'reflect-metadata';

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

export interface HerculesRuntimeFunctionDefinitionParameter {
    runtimeName: string,
    defaultValue?: PlainValue,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    hidden?: boolean,
    optional?: boolean
}

export interface HerculesRuntimeFunctionDefinition {
    runtimeName: string,
    parameters?: HerculesRuntimeFunctionDefinitionParameter[],
    signature: string,
    throwsError?: boolean,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    deprecationMessage?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
    linkedDataTypes?: string[],
    displayIcon?: string,
}

export interface HerculesFunctionDefinitionParameter {
    runtimeName: string,
    defaultValue?: PlainValue,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    hidden?: boolean,
    optional?: boolean,
    runtimeDefinitionName?: string
}

export interface HerculesFunctionDefinition {
    runtimeDefinitionName: string,
    runtimeName: string,
    parameters?: HerculesFunctionDefinitionParameter[],
    signature: string,
    throwsError?: boolean,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    deprecationMessage?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
    linkedDataTypes?: string[],
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
    linkedDataTypes?: string[],
    defaultValue?: PlainValue,
    identifier: string,
}

export type HerculesRegisterRuntimeFunctionParameter = {
    definition: HerculesRuntimeFunctionDefinition,
    handler: (...args: any[]) => Promise<PlainValue> | PlainValue,
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
    registerDataTypes: (...dataType: Array<HerculesDataType>) => Promise<void>,
    registerEventTypes: (...flowTypes: Array<HerculesEventType>) => Promise<void>,
    registerRuntimeFunctionDefinitionClass: (klass: RuntimeFunctionDefinitionClass) => Promise<void>,
    registerFunctionDefinitionClass: <T extends RuntimeFunctionDefinitionClass>(klass: FunctionDefinitionConstructor<T>) => Promise<void>,
    dispatchEvent: (eventType: string, projectId: number | bigint, payload: PlainValue) => Promise<void>,
}

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


export type FunctionDefinitionConstructor<T> = new () => T;

export type RuntimeFunctionDefinitionRunnable = {
    run: (...args: any[]) => Promise<PlainValue> | PlainValue;
};

export type RuntimeFunctionDefinitionClass<T extends RuntimeFunctionDefinitionRunnable = RuntimeFunctionDefinitionRunnable> =
    new () => T;


export const Identifier = (id: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:identifier', id, target);

export const OmitFunctionDefinition = (): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:omit_function_definition', true, target)

export const RuntimeParameter = (parameter: HerculesRuntimeFunctionDefinitionParameter): ClassDecorator =>
    (target) => {
        const parameters = Reflect.getMetadata('hercules:runtime_parameters', target) || [];
        parameters.push(parameter);

        Reflect.defineMetadata('hercules:runtime_parameters', parameters, target)
    }

export const FunctionParameter = (parameter: HerculesFunctionDefinitionParameter): ClassDecorator =>
    (target) => {
        const parameters = Reflect.getMetadata('hercules:function_parameters', target) || [];
        parameters.push(parameter);

        Reflect.defineMetadata('hercules:function_parameters', parameters, target)
    }

export const Name = (...translation: HerculesTranslation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:name', translation, target)

export const DisplayMessage = (...translation: HerculesTranslation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:display_message', translation, target)
export const Description = (...translation: HerculesTranslation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:description', translation, target)
export const DeprecationMessage = (...translation: HerculesTranslation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:deprecation_message', translation, target)
export const Alias = (...translation: HerculesTranslation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:alias', translation, target)
export const Documentation = (...translation: HerculesTranslation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:documentation', translation, target)

export const Signature = (signature: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:signature', signature, target)

export const LinkedDataTypeIdentifiers = (...linkedDataTypeIdentifiers: string[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:linked_data_type_identifiers', linkedDataTypeIdentifiers, target)

export const ThrowsError = (throwsError: boolean = true): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:throws_error', throwsError, target)

export const DisplayIcon = (displayIcon: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:display_icon', displayIcon, target)

export interface RegisteredFunction {
    identifier: string,
    definition: FunctionDefinition
}

export interface RegisteredRuntimeFunction {
    identifier: string,
    definition: RuntimeFunctionDefinition,
    handler: (...args: any[]) => Promise<PlainValue> | PlainValue,
}

export interface SdkState {
    functions: RegisteredFunction[],
    runtimeFunctions: RegisteredRuntimeFunction[],
    dataTypes: DefinitionDataType[],
    flowTypes: FlowType[],
    configurationDefinitions: ActionConfigurationDefinition[],
    projectConfigurations: ActionProjectConfiguration[],
    transport: GrpcTransport,
    client: ActionTransferServiceClient,
    stream: DuplexStreamingCall<TransferRequest, TransferResponse> | undefined,
    fullyConnected: boolean,
}