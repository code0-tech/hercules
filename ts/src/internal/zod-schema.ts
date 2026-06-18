import {toJSONSchema, type ZodTypeAny} from "zod";
import {zodToTs, printNode, createAuxiliaryTypeStore} from "zod-to-ts";
import type {DefinitionDataTypeRule} from "@code0-tech/tucana/shared";

type JsonSchema = {
    pattern?: string;
    minimum?: number;
    maximum?: number;
};

export function zodToTypeString(schema: ZodTypeAny): string {
    const {node} = zodToTs(schema, {auxiliaryTypeStore: createAuxiliaryTypeStore()});
    return printNode(node);
}

export function zodToRules(schema: ZodTypeAny): DefinitionDataTypeRule[] {
    const json = toJSONSchema(schema) as JsonSchema;
    const rules: DefinitionDataTypeRule[] = [];
    if (json.pattern) {
        rules.push({config: {oneofKind: "regex", regex: {pattern: json.pattern}}});
    }
    if (json.minimum !== undefined && json.maximum !== undefined) {
        rules.push({config: {oneofKind: "numberRange", numberRange: {from: BigInt(json.minimum), to: BigInt(json.maximum)}}});
    }
    return rules;
}
