import {PlainValue} from "@code0-tech/tucana/helpers";
import {HerculesTranslation} from "../types.ts";
import {RuntimeFlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";

export interface RuntimeEventDefinitionRunnable {}

export interface HerculesRuntimeEventSetting {
    identifier: string,
    unique?: RuntimeFlowTypeSetting_UniquenessScope,
    defaultValue?: PlainValue,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    optional?: boolean,
    hidden?: boolean,
}

export interface HerculesRuntimeEvent {
    identifier: string,
    runtimeSettings?: HerculesRuntimeEventSetting[],
    signature: string,
    linkedDataTypes?: string[],
    editable?: boolean,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
    displayIcon?: string,
}

export type RuntimeEventClass = new () => RuntimeEventDefinitionRunnable;
