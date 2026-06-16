import {PlainValue} from "@code0-tech/tucana/helpers";
import {HerculesTranslation} from "../types";
import {FlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";
import {RuntimeEventClass} from "./runtime-event";

export interface HerculesEventSetting {
    identifier: string,
    unique?: FlowTypeSetting_UniquenessScope,
    linkedDataTypeIdentifiers?: string[],
    defaultValue?: PlainValue,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    optional?: boolean,
    hidden?: boolean,
}

export interface HerculesEvent {
    identifier: string,
    settings?: HerculesEventSetting[],
    signature: string,
    linkedDataTypes?: string[],
    editable?: boolean,
    name?: HerculesTranslation[],
    description?: HerculesTranslation[],
    documentation?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
    displayIcon?: string,
    runtimeIdentifier?: string,
}

export interface EventDefinitionRunnable {}

export type EventClass<T extends RuntimeEventClass = RuntimeEventClass> = new () => InstanceType<T>;
