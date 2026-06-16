import type {PlainValue} from "@code0-tech/tucana/helpers";
import {
    RuntimeFunctionProps,
    RuntimeFunctionParameterProps,
    RuntimeFunctionClass,
} from "../models/runtime_function.model";

export const runtimeFunctionMap = (klass: RuntimeFunctionClass): RuntimeFunctionProps => {
    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const runtimeParameters: RuntimeFunctionParameterProps[] = Reflect.getMetadata('hercules:runtime_parameters', klass) || [];
    const name: RuntimeFunctionProps["name"] = Reflect.getMetadata('hercules:name', klass) || [];
    const displayMessage: RuntimeFunctionProps["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass) || [];
    const description: RuntimeFunctionProps["description"] = Reflect.getMetadata('hercules:description', klass) || [];
    const deprecationMessage: RuntimeFunctionProps["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass) || [];
    const alias: RuntimeFunctionProps["alias"] = Reflect.getMetadata('hercules:alias', klass) || [];
    const documentation: RuntimeFunctionProps["documentation"] = Reflect.getMetadata('hercules:documentation', klass) || [];
    const signature: RuntimeFunctionProps["signature"] = Reflect.getMetadata('hercules:signature', klass);
    const linkedDataTypes: RuntimeFunctionProps["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass) || [];
    const displayIcon: RuntimeFunctionProps["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass) || "";
    const throwsError: RuntimeFunctionProps["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass) || false;

    if (!identifier) throw new Error(`Runtime function class ${klass.name} is missing an identifier. Add @Identifier("your_identifier") to the class.`);
    if (!signature) throw new Error(`Runtime function class ${klass.name} is missing a signature. Add @Signature("(param1: TYPE_1): RETURN_TYPE") to the class.`);

    const instance = new klass();
    const handler = instance.run.bind(instance) as (...args: (PlainValue | undefined)[]) => Promise<PlainValue> | PlainValue;

    return {
        runtimeName: identifier,
        signature,
        throwsError,
        name,
        description,
        documentation,
        deprecationMessage,
        displayMessage,
        alias,
        linkedDataTypes,
        displayIcon: displayIcon || "tabler:note",
        parameters: runtimeParameters.map(param => ({
            ...param,
            name: param.name || [],
            description: param.description || [],
            documentation: param.documentation || [],
            hidden: param.hidden || false,
            optional: param.optional || false,
        })),
        handler,
    };
};
