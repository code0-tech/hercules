import {FlowTypeSetting_UniquenessScope, RuntimeFlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";
import type {Struct} from "@code0-tech/tucana/shared";
import type {ActionNodeSubFlowValue} from "@code0-tech/tucana/aquila";
import {PlainValue} from "@code0-tech/tucana/helpers";
import 'reflect-metadata';

export {FlowTypeSetting_UniquenessScope, RuntimeFlowTypeSetting_UniquenessScope};
export type {ActionNodeSubFlowValue, PlainValue, Struct};

export interface Translation {
    code: "en-US" | "de-DE" | string,
    content: string
}

/**
 * A sub flow passed as a parameter (e.g. a CONSUMER). Call it with the sub flow's
 * parameters to execute it and await its result. The input/output schema declared
 * for the sub flow by the caller are exposed via {@link SubFlow.inputSchema} and
 * {@link SubFlow.outputSchema} (either may be undefined if the caller omitted it).
 */
export interface SubFlow<R extends PlainValue = PlainValue> {
    (...args: PlainValue[]): Promise<R>;
    readonly inputSchema?: Struct;
    readonly outputSchema?: Struct;
}

export interface FunctionContext {
    projectId: number | bigint,
    executionId: string,
    matchedConfig: ProjectConfiguration,
    executeFlow: (flowId: string | bigint, payload?: PlainValue) => Promise<PlainValue>,
}

export interface ProjectConfiguration {
    projectId: number | bigint,
    configValues: { identifier: string, value: PlainValue }[],
    findConfig: (identifier: string) => PlainValue | undefined
}

export interface ConfigurationDefinition {
    name?: Translation[],
    description?: Translation[],
    type: string,
    hidden?: boolean,
    optional?: boolean,
    linkedDataTypes?: string[],
    defaultValue?: PlainValue,
    identifier: string,
}

export class RuntimeError extends Error {
    code: string
    description?: string

    constructor(code: string, description?: string) {
        super(`Runtime error with code ${code} occurred. ${description ? `Description: ${description}` : ""}`);
        this.name = "RuntimeErrorException";
        this.code = code;
        this.description = description
    }
}
