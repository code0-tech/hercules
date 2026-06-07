import {
    FunctionDefinitionClass, HerculesFunctionDefinition, HerculesFunctionDefinitionParameter,
    HerculesRuntimeFunctionDefinition, HerculesRuntimeFunctionDefinitionParameter, RuntimeFunctionDefinitionClass
} from "./functions";
import {constructValue} from "@code0-tech/tucana/helpers";

export const functionMap = <T extends RuntimeFunctionDefinitionClass>(klass: FunctionDefinitionClass<T>): HerculesFunctionDefinition => {
    const parentClass = Object.getPrototypeOf(klass)
    const runtimeFunction = runtimeFunctionMap(parentClass);

    const identifier: string = Reflect.getMetadata('hercules:identifier', klass)
    const functionParameters: HerculesFunctionDefinitionParameter[] = Reflect.getMetadata('hercules:function_parameters', klass)
    const names: HerculesFunctionDefinition["name"] = Reflect.getMetadata('hercules:name', klass)
    const displayMessage: HerculesFunctionDefinition["displayMessage"] = Reflect.getMetadata('hercules:display_message', klass)
    const description: HerculesFunctionDefinition["description"] = Reflect.getMetadata('hercules:description', klass)
    const deprecationMessage: HerculesFunctionDefinition["deprecationMessage"] = Reflect.getMetadata('hercules:deprecation_message', klass)
    const alias: HerculesFunctionDefinition["alias"] = Reflect.getMetadata('hercules:alias', klass)
    const documentation: HerculesFunctionDefinition["documentation"] = Reflect.getMetadata('hercules:documentation', klass)
    const signature: HerculesFunctionDefinition["signature"] = Reflect.getMetadata('hercules:signature', klass)
    const linkedDataTypeIdentifiers: HerculesFunctionDefinition["linkedDataTypes"] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass)
    const displayIcon: HerculesFunctionDefinition["displayIcon"] = Reflect.getMetadata('hercules:display_icon', klass)
    const throwsError: HerculesFunctionDefinition["throwsError"] = Reflect.getMetadata('hercules:throws_error', klass)

    if (functionParameters.length > (runtimeFunction?.parameters?.length ?? 0)) {
        throw new Error(`Function definition class ${klass.name} has more function parameters than its runtime function.`)
    }

    functionParameters.map(functionParameter => functionParameter.runtimeName).forEach(value => {
        if (!runtimeFunction?.parameters?.map(value => value.runtimeName).includes(value)) {
            throw new Error(`Function definition class ${klass.name} has a function parameter with runtime name ${value} that does not exist in its runtime function.`)
        }
    })


    runtimeFunction?.parameters?.forEach(runtimeDefinition => {
        if (functionParameters.find((param: HerculesFunctionDefinitionParameter) => param.runtimeName === runtimeDefinition.runtimeName)) {
            return;
        }
        functionParameters.push({
            ...runtimeDefinition,
            runtimeDefinitionName: runtimeDefinition.runtimeName
        })
    })


    return {
        runtimeDefinitionName: runtimeFunction.runtimeName,
        runtimeName: identifier || runtimeFunction.runtimeName,
        signature: signature || runtimeFunction.signature,
        throwsError: throwsError || runtimeFunction.throwsError,
        alias: alias || runtimeFunction.alias,
        description: description || runtimeFunction.description,
        name: names || runtimeFunction.name,
        documentation: documentation || runtimeFunction.documentation,
        deprecationMessage: deprecationMessage || runtimeFunction.deprecationMessage,
        displayMessage: displayMessage || runtimeFunction.displayMessage,
        displayIcon: displayIcon || runtimeFunction.displayIcon,
        linkedDataTypes: linkedDataTypeIdentifiers || runtimeFunction.linkedDataTypes,
        parameters: functionParameters.map(value => {
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
    }
}
export const runtimeFunctionMap = (klass: RuntimeFunctionDefinitionClass): HerculesRuntimeFunctionDefinition => {
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
        alias: alias || [],
        name: names || [],
        description: description || [],
        runtimeName: identifier,
        deprecationMessage: deprecationMessage || [],
        displayIcon: displayIcon || "tabler:note",
        displayMessage: displayMessage || [],
        documentation: documentation || [],
        linkedDataTypes: linkedDataTypeIdentifiers || [],
        parameters: runtimeParameters.map(param => {
            return {
                ...param,
                name: param.name || [],
                description: param.description || [],
                documentation: param.documentation || [],
                hidden: param.hidden || false,
                optional: param.optional || false,
                defaultValue: param.defaultValue ? constructValue(param.defaultValue) : undefined,
            }
        }),
        signature: signature,
        throwsError: throwsError || false,
        handler: runFunction
    }

}
