import type {ZodTypeAny} from "zod";

export const Schema = (schema: ZodTypeAny): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:schema', schema, target)
