import type {RegisteredFunction, RegisteredRuntimeFunction, RuntimeFunctionDefinitionClass, SdkState} from "../types";
import {buildRuntimeFunctionDefinition} from "../sdk/builder/builder";

export function registerRuntimeFunctionDefinitionClass(config: {
    authToken: string;
    aquilaUrl: string;
    actionId: string;
    version: string
}, state: SdkState) {
    return (klass: RuntimeFunctionDefinitionClass): Promise<void> => {
        const omitFunctionDefinition = Reflect.getMetadata('hercules:omit_function_definition', klass) || false

        const runtimeFunction = buildRuntimeFunctionDefinition(klass, config);
        const definition = runtimeFunction.definition

        state.runtimeFunctions.push(runtimeFunction as RegisteredRuntimeFunction)
        if (!omitFunctionDefinition) {
            state.functions.push({
                identifier: definition.runtimeName,
                definition: {
                    ...definition,
                    runtimeDefinitionName: definition.runtimeName,
                    parameterDefinitions: definition.runtimeParameterDefinitions.map(param => {
                        return {
                            ...param,
                            runtimeDefinitionName: param.runtimeName
                        }
                    })
                }
            } as RegisteredFunction)
        }

        return Promise.resolve();
    };
}