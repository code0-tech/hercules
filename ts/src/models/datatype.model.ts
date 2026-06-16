import {DefinitionDataTypeRule} from "@code0-tech/tucana/shared";
import {Translation} from "../types";

export interface DataTypeProps {
    identifier: string,
    name?: Translation[],
    displayMessage?: Translation[],
    alias?: Translation[],
    rules?: DefinitionDataTypeRule[],
    genericKeys?: string[],
    type: string,
    linkedDataTypes?: string[],
}

export interface DataTypeRunnable {}

export type DataTypeClass = new () => DataTypeRunnable;
