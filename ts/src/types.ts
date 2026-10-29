import {FlowTypeSetting_UniquenessScope, RuntimeFlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";
import type {Struct} from "@code0-tech/tucana/shared";
import type {ActionNodeSubFlowValue} from "@code0-tech/tucana/aquila";
import type {ZodTypeAny} from "zod";
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

/**
 * Describes a sub flow function's input or output. Normally a zod schema, which is
 * converted to a JSON schema while the result is sent. A plain JSON schema object or
 * a ready-made {@link Struct} (e.g. one taken from a {@link SubFlow}) is passed
 * through unchanged.
 */
export type SubFlowFunctionSchema = ZodTypeAny | Struct | Record<string, PlainValue>;

/**
 * A sub flow function returned from a runtime function's `run` block in place of raw
 * data. Hercules registers `run` internally and reports the function to Aquila as a
 * `shared.SubFlowFunctionResult`, so the flow can invoke it later like any other sub
 * flow. Its name, description and I/O schema have to be declared here, because
 * nothing in the action's module definition describes a function created at runtime.
 *
 * ```ts
 * return {
 *     name: "greet",
 *     description: "Greets a name",
 *     inputSchema: z.object({name: z.string()}),
 *     outputSchema: z.string(),
 *     run: (name) => `Hello ${String(name)}`,
 * };
 * ```
 */
export interface SubFlowFunctionDefinition<R extends PlainValue = PlainValue> {
    name: string;
    description: string;
    inputSchema: SubFlowFunctionSchema;
    outputSchema: SubFlowFunctionSchema;
    run(...args: (PlainValue | undefined)[]): Promise<R> | R;
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
