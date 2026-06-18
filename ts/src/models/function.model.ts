import {Translation} from "../types";
import {PlainValue} from "@code0-tech/tucana/helpers";
import {RuntimeFunctionClass} from "./runtime_function.model";

export interface FunctionParameterProps {
    runtimeName: string,
    defaultValue?: PlainValue,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    hidden?: boolean,
    optional?: boolean,
    runtimeDefinitionName?: string,
}

export interface FunctionProps {
    runtimeDefinitionName: string,
    runtimeName: string,
    parameters?: FunctionParameterProps[],
    signature: string,
    throwsError?: boolean,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    deprecationMessage?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    displayIcon?: string,
    design?: string,
}

export type FunctionClass<T extends RuntimeFunctionClass> = new () => InstanceType<T>;
