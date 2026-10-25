import {PlainValue} from "@code0-tech/tucana/helpers";
import {SubFlowFunctionDefinition, Translation} from "../types";
import {FunctionParameterProps} from "./function.model";

/**
 * What a runtime function's `run` block may produce: raw data, or a
 * {@link SubFlowFunctionDefinition} that Hercules registers and reports to Aquila as
 * a `shared.SubFlowFunctionResult`.
 */
export type RuntimeFunctionReturn = PlainValue | SubFlowFunctionDefinition;

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
    handler: (...args: (PlainValue | undefined)[]) => Promise<RuntimeFunctionReturn> | RuntimeFunctionReturn,
}

export interface RuntimeFunctionRunnable {
    run(...args: (PlainValue | undefined)[]): Promise<RuntimeFunctionReturn> | RuntimeFunctionReturn;
}

export type RuntimeFunctionClass<T extends RuntimeFunctionRunnable = RuntimeFunctionRunnable> =
    new () => T;
