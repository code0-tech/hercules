export const OmitEventDefinition = (): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:omit_event_definition', true, target)
