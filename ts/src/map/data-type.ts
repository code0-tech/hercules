import {zodToRules, zodToTypeString} from "../internal/zod-schema";
import type {HerculesTranslation} from "../types";
import type {DataTypeClass, HerculesDataType} from "../models/data-type";

export const dataTypeMap = (klass: DataTypeClass): HerculesDataType => {
    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const name: HerculesTranslation[] = Reflect.getMetadata('hercules:name', klass) || [];
    const displayMessage: HerculesTranslation[] = Reflect.getMetadata('hercules:display_message', klass) || [];
    const alias: HerculesTranslation[] = Reflect.getMetadata('hercules:alias', klass) || [];
    const linkedDataTypes: string[] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass) || [];
    const genericKeys: string[] = Reflect.getMetadata('hercules:generic_keys', klass) || [];

    if (!identifier) throw new Error(`Data type class ${klass.name} is missing an identifier. Add @Identifier("your_identifier") to the class.`);

    const schema = Reflect.getMetadata('hercules:schema', klass);
    if (!schema) throw new Error(`Data type class ${klass.name} is missing a schema. Add @Schema(z.string()) to the class.`);

    return {
        identifier,
        type: zodToTypeString(schema),
        rules: zodToRules(schema),
        name,
        displayMessage,
        alias,
        linkedDataTypes,
        genericKeys,
    };
};
