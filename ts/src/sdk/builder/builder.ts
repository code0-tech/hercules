import 'reflect-metadata';
import {constructValue} from "@code0-tech/tucana/helpers";
import {
    RuntimeFunctionDefinitionClass,
    RegisteredRuntimeFunction,
    HerculesRuntimeFunctionDefinitionParameter,
    HerculesRuntimeFunctionDefinition,
    ActionSdk,
} from "../../types";
import {RuntimeParameterDefinition} from "@code0-tech/tucana/shared";

export function buildRuntimeFunctionDefinition(klass: RuntimeFunctionDefinitionClass, config: ActionSdk["config"]): RegisteredRuntimeFunction {
    const identifier: string = Reflect.getMetadata('hercules:identifier', klass)
    const runtimeParameters: HerculesRuntimeFunctionDefinitionParameter[] = Reflect.getMetadata('hercules:runtime_parameters', klass)
    const names: HerculesRuntimeFunctionDefinition["name"] = Reflect.getMetadata('hercules:name', klass) || []
    const displayMessage: HerculesRuntimeFunctionDefinition["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass) || []
    const description: HerculesRuntimeFunctionDefinition["description"] = Reflect.getMetadata('hercules:description', klass) || []
    const deprecationMessage: HerculesRuntimeFunctionDefinition["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass) || []
    const alias: HerculesRuntimeFunctionDefinition["alias"] = Reflect.getMetadata('hercules:alias', klass) || []
    const documentation: HerculesRuntimeFunctionDefinition["documentation"] = Reflect.getMetadata('hercules:documentation', klass) || []
    const signature: HerculesRuntimeFunctionDefinition["signature"] = Reflect.getMetadata('hercules:signature', klass)
    const linkedDataTypeIdentifiers: HerculesRuntimeFunctionDefinition["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass) || []
    const version: HerculesRuntimeFunctionDefinition["version"] = Reflect.getMetadata('hercules:version', klass) || config.version
    const displayIcon: HerculesRuntimeFunctionDefinition["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass) || ""
    const throwsError: HerculesRuntimeFunctionDefinition["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass) || false
    const runFunction = new klass().run

    if (!identifier) {
        throw new Error(`Runtime function class ${klass.name} is missing an identifier. Please add @Identifier("your_identifier") decorator to the class.`)
    }
    if (!signature) {
        throw new Error(`Runtime function class ${klass.name} is missing a signature. Please add @Signature("(param1: TYPE_1): RETURN_TYPE") decorator to the class.`)
    }

    return {
        identifier: identifier as string,
        definition: {
            alias: alias || [],
            name: names || [],
            description: description || [],
            version: version || config.version,
            runtimeName: identifier,
            deprecationMessage: deprecationMessage || [],
            displayIcon: displayIcon || "tabler:note",
            displayMessage: displayMessage || [],
            documentation: documentation || [],
            linkedDataTypeIdentifiers: linkedDataTypeIdentifiers || [],
            runtimeParameterDefinitions: runtimeParameters.map(param => {
                return {
                    ...param,
                    name: param.name || [],
                    description: param.description || [],
                    documentation: param.documentation || [],
                    hidden: param.hidden || false,
                    optional: param.optional || false,
                    defaultValue: param.defaultValue ? constructValue(param.defaultValue) : undefined,
                } as RuntimeParameterDefinition
            }),
            signature: signature,
            throwsError: throwsError || false,
            definitionSource: "action"
        },
        handler: runFunction
    } as RegisteredRuntimeFunction
}

