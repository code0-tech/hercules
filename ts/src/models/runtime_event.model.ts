import {Translation} from "../types";
import {EventSettingProps} from "./event.model";

export interface RuntimeEventRunnable {}

export interface RuntimeEventProps {
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
}

export type RuntimeEventClass = new () => RuntimeEventRunnable;
