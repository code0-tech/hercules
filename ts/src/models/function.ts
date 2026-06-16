import {HerculesTranslation} from "../types";
import {PlainValue} from "@code0-tech/tucana/helpers";
import {RuntimeFunctionDefinitionClass} from "./runtime-function";

export interface HerculesFunctionDefinitionParameter {
    runtimeName: string,
    defaultValue?: PlainValue,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    hidden?: boolean,
    optional?: boolean,
    runtimeDefinitionName?: string,
}

export interface HerculesFunctionDefinition {
    runtimeDefinitionName: string,
    runtimeName: string,
    parameters?: HerculesFunctionDefinitionParameter[],
    signature: string,
    throwsError?: boolean,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    deprecationMessage?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
    linkedDataTypes?: string[],
    displayIcon?: string,
}

export type FunctionDefinitionClass<T extends RuntimeFunctionDefinitionClass> = new () => InstanceType<T>;
