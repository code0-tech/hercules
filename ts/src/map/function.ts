import {FunctionClass, FunctionProps, FunctionParameterProps} from "../models/function.model";
import {RuntimeFunctionClass} from "../models/runtime_function.model";
import {runtimeFunctionMap} from "./runtime-function";

export const functionMap = <T extends RuntimeFunctionClass>(klass: FunctionClass<T>): FunctionProps => {
    const parentClass = Object.getPrototypeOf(klass);
    const runtimeFunction = runtimeFunctionMap(parentClass);

    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const functionParameters: FunctionParameterProps[] = Reflect.getMetadata('hercules:function_parameters', klass) || [];
    const name: FunctionProps["name"] = Reflect.getMetadata('hercules:name', klass);
    const displayMessage: FunctionProps["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass);
    const description: FunctionProps["description"] = Reflect.getMetadata('hercules:description', klass);
    const deprecationMessage: FunctionProps["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass);
    const alias: FunctionProps["alias"] = Reflect.getMetadata('hercules:alias', klass);
    const documentation: FunctionProps["documentation"] = Reflect.getMetadata('hercules:documentation', klass);
    const signature: FunctionProps["signature"] = Reflect.getMetadata('hercules:signature', klass);
    const linkedDataTypes: FunctionProps["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass);
    const displayIcon: FunctionProps["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass);
    const throwsError: FunctionProps["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass);

    if (functionParameters.length > (runtimeFunction.parameters?.length ?? 0)) {
        throw new Error(`Function definition class ${klass.name} has more function parameters than its runtime function.`);
    }

    for (const fp of functionParameters) {
        if (!runtimeFunction.parameters?.find(p => p.runtimeName === fp.runtimeName)) {
            throw new Error(`Function definition class ${klass.name} has a function parameter "${fp.runtimeName}" that does not exist in its runtime function.`);
        }
    }

    const mergedParameters: FunctionParameterProps[] = [...functionParameters];
    for (const rp of runtimeFunction.parameters ?? []) {
        if (!mergedParameters.find(p => p.runtimeName === rp.runtimeName)) {
            mergedParameters.push({...rp, runtimeDefinitionName: rp.runtimeName});
        }
    }

    return {
        runtimeDefinitionName: runtimeFunction.runtimeName,
        runtimeName: identifier || runtimeFunction.runtimeName,
        signature: signature || runtimeFunction.signature,
        throwsError: throwsError ?? runtimeFunction.throwsError,
        alias: alias || runtimeFunction.alias,
        description: description || runtimeFunction.description,
        name: name || runtimeFunction.name,
        documentation: documentation || runtimeFunction.documentation,
        deprecationMessage: deprecationMessage || runtimeFunction.deprecationMessage,
        displayMessage: displayMessage || runtimeFunction.displayMessage,
        displayIcon: displayIcon || runtimeFunction.displayIcon,
        linkedDataTypes: linkedDataTypes || runtimeFunction.linkedDataTypes,
        parameters: mergedParameters.map(p => ({
            ...p,
            runtimeDefinitionName: p.runtimeDefinitionName || p.runtimeName,
            name: p.name || [],
            description: p.description || [],
            documentation: p.documentation || [],
            hidden: p.hidden || false,
            optional: p.optional || false,
        })),
    };
};
