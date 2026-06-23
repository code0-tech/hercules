import {registerSchema, zodToRules, zodToTypeString} from "../internal/zod-schema";
import type {Translation} from "../types";
import type {DataTypeClass, DataTypeProps} from "../models/datatype.model";

export const dataTypeMap = (klass: DataTypeClass): DataTypeProps => {
    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const name: Translation[] = Reflect.getMetadata('hercules:name', klass) || [];
    const displayMessage: Translation[] = Reflect.getMetadata('hercules:display_message', klass) || [];
    const alias: Translation[] = Reflect.getMetadata('hercules:alias', klass) || [];
    const genericKeys: string[] = Reflect.getMetadata('hercules:generic_keys', klass) || [];

    if (!identifier) throw new Error(`Data type class ${klass.name} is missing an identifier. Add @Identifier("your_identifier") to the class.`);

    const schema = Reflect.getMetadata('hercules:schema', klass);
    if (!schema) throw new Error(`Data type class ${klass.name} is missing a schema. Add @Schema(z.string()) to the class.`);

    registerSchema(schema, identifier);

    return {
        identifier,
        type: zodToTypeString(schema),
        rules: zodToRules(schema),
        name,
        displayMessage,
        alias,
        genericKeys,
    };
};
