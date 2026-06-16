import type {ZodTypeAny} from "zod";

export const Schema = (schema: ZodTypeAny): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:schema', schema, target)

export const GenericKeys = (...keys: string[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:generic_keys', keys, target)
