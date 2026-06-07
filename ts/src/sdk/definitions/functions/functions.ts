import {PlainValue} from "@code0-tech/tucana/helpers";
import {
    HerculesTranslation,
} from "../../../types";


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
    handler: (...args: any[]) => Promise<PlainValue> | PlainValue,
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


export type FunctionDefinitionClass<T> = new () => T;

export type RuntimeFunctionDefinitionRunnable = {
    run: (...args: any[]) => Promise<PlainValue> | PlainValue;
};

export type RuntimeFunctionDefinitionClass<T extends RuntimeFunctionDefinitionRunnable = RuntimeFunctionDefinitionRunnable> =
    new () => T;

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

export const ThrowsError = (throwsError: boolean = true): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:throws_error', throwsError, target)



export const LinkedDataTypeIdentifiers = (...linkedDataTypeIdentifiers: string[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:linked_data_type_identifiers', linkedDataTypeIdentifiers, target)
