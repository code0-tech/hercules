import {FlowTypeSetting_UniquenessScope, RuntimeFlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";
import {PlainValue} from "@code0-tech/tucana/helpers";
import 'reflect-metadata';

export {FlowTypeSetting_UniquenessScope, RuntimeFlowTypeSetting_UniquenessScope};

export interface Translation {
    code: "en-US" | "de-DE" | string,
    content: string
}

export interface FunctionContext {
    projectId: number | bigint,
    executionId: string,
    matchedConfig: ProjectConfiguration
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
