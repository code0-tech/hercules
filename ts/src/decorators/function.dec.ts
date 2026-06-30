import {FunctionParameterProps} from "../models/function.model";

export const OmitFunction = (): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:omit_function_definition', true, target)

export const Design = (design: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:design', design, target)

export const ThrowsError = (throwsError: boolean = true): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:throws_error', throwsError, target)

export const Parameter = (parameter: FunctionParameterProps): ClassDecorator =>
    (target) => {
        const parameters = Reflect.getMetadata('hercules:function_parameters', target) || [];
        parameters.unshift(parameter);
        Reflect.defineMetadata('hercules:function_parameters', parameters, target);
    }
