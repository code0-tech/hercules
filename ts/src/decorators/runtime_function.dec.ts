export const OmitRuntimeFunction = (): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:omit_function_definition', true, target)
