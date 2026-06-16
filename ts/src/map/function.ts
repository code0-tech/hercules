import {FunctionDefinitionClass, HerculesFunctionDefinition, HerculesFunctionDefinitionParameter} from "../models/function";
import {RuntimeFunctionDefinitionClass} from "../models/runtime-function";
import {runtimeFunctionMap} from "./runtime-function";

export const functionMap = <T extends RuntimeFunctionDefinitionClass>(klass: FunctionDefinitionClass<T>): HerculesFunctionDefinition => {
    const parentClass = Object.getPrototypeOf(klass);
    const runtimeFunction = runtimeFunctionMap(parentClass);

    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const functionParameters: HerculesFunctionDefinitionParameter[] = Reflect.getMetadata('hercules:function_parameters', klass) || [];
    const name: HerculesFunctionDefinition["name"] = Reflect.getMetadata('hercules:name', klass);
    const displayMessage: HerculesFunctionDefinition["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass);
    const description: HerculesFunctionDefinition["description"] = Reflect.getMetadata('hercules:description', klass);
    const deprecationMessage: HerculesFunctionDefinition["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass);
    const alias: HerculesFunctionDefinition["alias"] = Reflect.getMetadata('hercules:alias', klass);
    const documentation: HerculesFunctionDefinition["documentation"] = Reflect.getMetadata('hercules:documentation', klass);
    const signature: HerculesFunctionDefinition["signature"] = Reflect.getMetadata('hercules:signature', klass);
    const linkedDataTypes: HerculesFunctionDefinition["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass);
    const displayIcon: HerculesFunctionDefinition["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass);
    const throwsError: HerculesFunctionDefinition["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass);

    if (functionParameters.length > (runtimeFunction.parameters?.length ?? 0)) {
        throw new Error(`Function definition class ${klass.name} has more function parameters than its runtime function.`);
    }

    for (const fp of functionParameters) {
        if (!runtimeFunction.parameters?.find(p => p.runtimeName === fp.runtimeName)) {
            throw new Error(`Function definition class ${klass.name} has a function parameter "${fp.runtimeName}" that does not exist in its runtime function.`);
        }
    }

    const mergedParameters: HerculesFunctionDefinitionParameter[] = [...functionParameters];
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
