import type {
    FunctionDefinitionConstructor,
    HerculesFunctionDefinition,
    HerculesFunctionDefinitionParameter, RegisteredFunction,
    SdkState
} from "../../types";
import {buildRuntimeFunctionDefinition} from "./builder";
import {constructValue} from "@code0-tech/tucana/helpers";

export function registerFunctionDefinitionClass(config: {
    authToken: string;
    aquilaUrl: string;
    actionId: string;
    version: string
}, state: SdkState) {
    return <T>(klass: FunctionDefinitionConstructor<T>): Promise<void> => {
        const parentClass = Object.getPrototypeOf(klass)
        const runtimeFunction = buildRuntimeFunctionDefinition(parentClass, config);
        const runtimeDefinition = runtimeFunction.definition

        const functionParameters: HerculesFunctionDefinitionParameter[] = Reflect.getMetadata('hercules:function_parameters', klass)
        const names: HerculesFunctionDefinition["name"] = Reflect.getMetadata('hercules:name', klass)
        const displayMessage: HerculesFunctionDefinition["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass)
        const description: HerculesFunctionDefinition["description"] = Reflect.getMetadata('hercules:description', klass)
        const deprecationMessage: HerculesFunctionDefinition["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass)
        const alias: HerculesFunctionDefinition["alias"] = Reflect.getMetadata('hercules:alias', klass)
        const documentation: HerculesFunctionDefinition["documentation"] = Reflect.getMetadata('hercules:documentation', klass)
        const signature: HerculesFunctionDefinition["signature"] = Reflect.getMetadata('hercules:signature', klass)
        const linkedDataTypeIdentifiers: HerculesFunctionDefinition["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass)
        const version: HerculesFunctionDefinition["version"] = Reflect.getMetadata('hercules:version', klass)
        const displayIcon: HerculesFunctionDefinition["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass)
        const throwsError: HerculesFunctionDefinition["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass)

        runtimeDefinition.runtimeParameterDefinitions.forEach(runtimeDefinition => {
            if (functionParameters.find((param: HerculesFunctionDefinitionParameter) => param.runtimeName === runtimeDefinition.runtimeName)) {
                return;
            }
            functionParameters.push({
                ...runtimeDefinition,
                runtimeDefinitionName: runtimeDefinition.runtimeName
            })
        })

        state.functions.push({
            identifier: runtimeFunction.identifier,
            definition: {
                runtimeDefinitionName: runtimeDefinition.runtimeName,
                runtimeName: runtimeDefinition.runtimeName || runtimeDefinition.runtimeName,
                signature: signature || runtimeDefinition.signature,
                throwsError: throwsError || runtimeDefinition.throwsError,
                alias: alias || runtimeDefinition.alias,
                version: version || runtimeDefinition.version,
                description: description || runtimeDefinition.description,
                name: names || runtimeDefinition.name,
                documentation: documentation || runtimeDefinition.documentation,
                deprecationMessage: deprecationMessage || runtimeDefinition.deprecationMessage,
                displayMessage: displayMessage || runtimeDefinition.displayMessage,
                displayIcon: displayIcon || runtimeDefinition.displayIcon,
                definitionSource: "action",
                linkedDataTypeIdentifiers: linkedDataTypeIdentifiers || runtimeDefinition.linkedDataTypeIdentifiers,
                parameterDefinitions: functionParameters.map(value => {
                    return {
                        ...value,
                        runtimeDefinitionName: value.runtimeDefinitionName || value.runtimeName,
                        name: value.name || [],
                        description: value.description || [],
                        documentation: value.documentation || [],
                        hidden: value.hidden || false,
                        optional: value.optional || false,
                        defaultValue: value.defaultValue ? constructValue(value.defaultValue || null) : undefined,
                    }
                })
            },
        } as RegisteredFunction)

        return Promise.resolve();
    };
}
