import {PlainValue} from "@code0-tech/tucana/helpers";
import {Translation} from "../types";
import {RuntimeFlowTypeSetting_UniquenessScope} from "@code0-tech/tucana/shared";

export interface RuntimeEventRunnable {}

export interface RuntimeEventSettingProps {
    identifier: string,
    unique?: RuntimeFlowTypeSetting_UniquenessScope,
    defaultValue?: PlainValue,
    name?: Translation[],
    description?: Translation[],
    optional?: boolean,
    hidden?: boolean,
}

export interface RuntimeEventProps {
    identifier: string,
    runtimeSettings?: RuntimeEventSettingProps[],
    signature: string,
    linkedDataTypes?: string[],
    editable?: boolean,
    name?: Translation[],
    description?: Translation[],
    documentation?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    displayIcon?: string,
}

export type RuntimeEventClass = new () => RuntimeEventRunnable;
