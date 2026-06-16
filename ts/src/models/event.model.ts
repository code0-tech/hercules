import {PlainValue} from "@code0-tech/tucana/helpers";
import {Translation} from "../types";
import {FlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";
import {RuntimeEventClass} from "./runtime_event.model";

export interface EventSettingProps {
    identifier: string,
    unique?: FlowTypeSetting_UniquenessScope,
    linkedDataTypeIdentifiers?: string[],
    defaultValue?: PlainValue,
    name?: Translation[],
    description?: Translation[],
    optional?: boolean,
    hidden?: boolean,
}

export interface EventModel {
    identifier: string,
    settings?: EventSettingProps[],
    signature: string,
    linkedDataTypes?: string[],
    editable?: boolean,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    displayIcon?: string,
    runtimeIdentifier?: string,
}
export type EventClass<T extends RuntimeEventClass = RuntimeEventClass> = new () => InstanceType<T>;
