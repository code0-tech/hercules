import {FlowTypeSetting_UniquenessScope, RuntimeFlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";
import {PlainValue} from "@code0-tech/tucana/helpers";
import 'reflect-metadata';

export {FlowTypeSetting_UniquenessScope, RuntimeFlowTypeSetting_UniquenessScope};

export interface HerculesTranslation {
    code: "en-US" | "de-DE" | string,
    content: string
}

export interface HerculesFunctionContext {
    projectId: number | bigint,
    executionId: string,
    matchedConfig: HerculesActionProjectConfiguration
}

export interface HerculesActionProjectConfiguration {
    projectId: number | bigint,
    configValues: { identifier: string, value: PlainValue }[],
    findConfig: (identifier: string) => PlainValue | undefined
}

export interface HerculesActionConfigurationDefinition {
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    type: string,
    hidden?: boolean,
    optional?: boolean,
    linkedDataTypes?: string[],
    defaultValue?: PlainValue,
    identifier: string,
}

export class RuntimeErrorException extends Error {
    code: string
    description?: string

    constructor(code: string, description?: string) {
        super(`Runtime error with code ${code} occurred. ${description ? `Description: ${description}` : ""}`);
        this.name = "RuntimeErrorException";
        this.code = code;
        this.description = description
    }
}
