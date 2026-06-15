import {HerculesFunctionDefinitionParameter} from "../models/function.ts";
import {HerculesRuntimeFunctionDefinitionParameter} from "../models/runtime-function.ts";

export const OmitFunctionDefinition = (): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:omit_function_definition', true, target)

export const ThrowsError = (throwsError: boolean = true): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:throws_error', throwsError, target)

export const LinkedDataTypeIdentifiers = (...linkedDataTypeIdentifiers: string[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:linked_data_type_identifiers', linkedDataTypeIdentifiers, target)

export const RuntimeParameter = (parameter: HerculesRuntimeFunctionDefinitionParameter): ClassDecorator =>
    (target) => {
        const parameters = Reflect.getMetadata('hercules:runtime_parameters', target) || [];
        parameters.push(parameter);
        Reflect.defineMetadata('hercules:runtime_parameters', parameters, target);
    }

export const FunctionParameter = (parameter: HerculesFunctionDefinitionParameter): ClassDecorator =>
    (target) => {
        const parameters = Reflect.getMetadata('hercules:function_parameters', target) || [];
        parameters.push(parameter);
        Reflect.defineMetadata('hercules:function_parameters', parameters, target);
    }
