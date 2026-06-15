import {DefinitionDataTypeRule} from "@code0-tech/tucana/shared";
import {HerculesTranslation} from "../types.ts";

export interface HerculesDataType {
    identifier: string,
    name?: HerculesTranslation[],
    displayMessage?: HerculesTranslation[],
    alias?: HerculesTranslation[],
    rules?: DefinitionDataTypeRule[],
    genericKeys?: string[],
    type: string,
    linkedDataTypes?: string[],
}

export interface DataTypeDefinitionRunnable {}

export type DataTypeClass = new () => DataTypeDefinitionRunnable;
