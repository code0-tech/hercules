import {FunctionParameterProps} from "../models/function.model";

export const OmitFunction = (): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:omit_function_definition', true, target)

export const Design = (design: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:design', design, target)

export const ThrowsError = (throwsError: boolean = true): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:throws_error', throwsError, target)

export const Parameter = (parameter: FunctionParameterProps): ClassDecorator =>
    (target) => {
        // getOwnMetadata: getMetadata would return the parent class's array on subclasses,
        // and unshift would mutate the parent's parameters.
        const parameters = Reflect.getOwnMetadata('hercules:function_parameters', target) || [];
        parameters.unshift(parameter);
        Reflect.defineMetadata('hercules:function_parameters', parameters, target);
    }
