import {PlainValue} from "@code0-tech/tucana/helpers";
import {Translation} from "../types";

export interface RuntimeFunctionParameterProps {
    runtimeName: string,
    defaultValue?: PlainValue,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    hidden?: boolean,
    optional?: boolean,
}

export interface RuntimeFunctionProps {
    runtimeName: string,
    parameters?: RuntimeFunctionParameterProps[],
    signature: string,
    throwsError?: boolean,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    deprecationMessage?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    linkedDataTypes?: string[],
    displayIcon?: string,
    handler: (...args: (PlainValue | undefined)[]) => Promise<PlainValue> | PlainValue,
}

export interface RuntimeFunctionRunnable {
    run(...args: (PlainValue | undefined)[]): Promise<PlainValue> | PlainValue;
}

export type RuntimeFunctionClass<T extends RuntimeFunctionRunnable = RuntimeFunctionRunnable> =
    new () => T;
