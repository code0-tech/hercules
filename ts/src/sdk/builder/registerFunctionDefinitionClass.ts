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

}
