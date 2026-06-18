import {PlainValue} from "@code0-tech/tucana/helpers";
import {Translation} from "../types";
import {FunctionParameterProps} from "./function.model";

export interface RuntimeFunctionProps {
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
    handler: (...args: (PlainValue | undefined)[]) => Promise<PlainValue> | PlainValue,
}

export interface RuntimeFunctionRunnable {
    run(...args: (PlainValue | undefined)[]): Promise<PlainValue> | PlainValue;
}

export type RuntimeFunctionClass<T extends RuntimeFunctionRunnable = RuntimeFunctionRunnable> =
    new () => T;
