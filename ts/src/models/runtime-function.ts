import {PlainValue} from "@code0-tech/tucana/helpers";
import {HerculesTranslation} from "../types.ts";

export interface HerculesRuntimeFunctionDefinitionParameter {
    runtimeName: string,
    defaultValue?: PlainValue,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    hidden?: boolean,
    optional?: boolean,
}

export interface HerculesRuntimeFunctionDefinition {
    runtimeName: string,
    parameters?: HerculesRuntimeFunctionDefinitionParameter[],
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
    handler: (...args: (PlainValue | undefined)[]) => Promise<PlainValue> | PlainValue,
}

export interface RuntimeFunctionDefinitionRunnable {
    run(...args: (PlainValue | undefined)[]): Promise<PlainValue> | PlainValue;
}

export type RuntimeFunctionDefinitionClass<T extends RuntimeFunctionDefinitionRunnable = RuntimeFunctionDefinitionRunnable> =
    new () => T;
