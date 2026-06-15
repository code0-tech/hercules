import {constructValue} from "@code0-tech/tucana/helpers";
import {DefinitionDataType, FlowType, FlowTypeSetting, Module, ModuleConfigurationDefinition, RuntimeFlowType, RuntimeFlowTypeSetting} from "@code0-tech/tucana/shared";
import type {HerculesFunctionDefinition} from "../models/function.ts";
import type {HerculesRuntimeFunctionDefinition} from "../models/runtime-function.ts";
import type {HerculesActionConfigurationDefinition, HerculesTranslation} from "../types.ts";
import {HerculesDataType} from "../models/data-type.ts";
import {HerculesEvent} from "../models/event.ts";
import {HerculesRuntimeEvent} from "../models/runtime-event.ts";

export interface ModuleBuildData {
    identifier: string;
    version: string;
    author: string;
    icon: string;
    documentation: string;
    name: HerculesTranslation[];
    configurationDefinitions: HerculesActionConfigurationDefinition[];
    dataTypes: HerculesDataType[];
    events: HerculesEvent[];
    runtimeEvents: HerculesRuntimeEvent[];
    functions: HerculesFunctionDefinition[];
    runtimeFunctions: HerculesRuntimeFunctionDefinition[];
}

export function buildModule(data: ModuleBuildData): Module {
    return {
        identifier: data.identifier,
        version: data.version,
        author: data.author,
        icon: data.icon,
        documentation: data.documentation,
        name: data.name,
        description: [],
        configurations: data.configurationDefinitions.map(def => ({
            identifier: def.identifier,
            name: def.name ?? [],
            description: def.description ?? [],
            type: def.type,
            linkedDataTypeIdentifiers: def.linkedDataTypes ?? [],
            defaultValue: def.defaultValue != null ? constructValue(def.defaultValue) : undefined,
            optional: def.optional ?? false,
            hidden: def.hidden ?? false,
        } as ModuleConfigurationDefinition)),
        definitionDataTypes: data.dataTypes.map(dt => ({
            identifier: dt.identifier,
            name: dt.name ?? [],
            alias: dt.alias ?? [],
            rules: dt.rules ?? [],
            genericKeys: dt.genericKeys ?? [],
            type: dt.type,
            linkedDataTypeIdentifiers: dt.linkedDataTypes ?? [],
            displayMessage: dt.displayMessage ?? [],
            version: data.version,
            definitionSource: "action",
        } as DefinitionDataType)),
        flowTypes: data.events.map(ft => ({
            identifier: ft.identifier,
            settings: (ft.settings ?? []).map(s => ({
                identifier: s.identifier,
                unique: s.unique ?? 1,
                linkedDataTypeIdentifiers: s.linkedDataTypeIdentifiers ?? [],
                defaultValue: s.defaultValue != null ? constructValue(s.defaultValue) : undefined,
                name: s.name ?? [],
                description: s.description ?? [],
                optional: s.optional ?? false,
                hidden: s.hidden ?? false,
            } as FlowTypeSetting)),
            editable: ft.editable ?? false,
            name: ft.name ?? [],
            description: ft.description ?? [],
            documentation: ft.documentation ?? [],
            displayMessage: ft.displayMessage ?? [],
            alias: ft.alias ?? [],
            version: data.version,
            displayIcon: ft.displayIcon ?? "tabler:note",
            definitionSource: "action",
            linkedDataTypeIdentifiers: ft.linkedDataTypes ?? [],
            signature: ft.signature,
            runtimeIdentifier: ft.runtimeIdentifier ?? ft.identifier,
        } as FlowType)),
        runtimeFlowTypes: data.runtimeEvents.map(rft => ({
            identifier: rft.identifier,
            runtimeSettings: (rft.runtimeSettings ?? []).map(s => ({
                identifier: s.identifier,
                unique: s.unique ?? 0,
                defaultValue: s.defaultValue != null ? constructValue(s.defaultValue) : undefined,
                name: s.name ?? [],
                description: s.description ?? [],
                optional: s.optional ?? false,
                hidden: s.hidden ?? false,
            } as RuntimeFlowTypeSetting)),
            editable: rft.editable ?? false,
            name: rft.name ?? [],
            description: rft.description ?? [],
            documentation: rft.documentation ?? [],
            displayMessage: rft.displayMessage ?? [],
            alias: rft.alias ?? [],
            version: data.version,
            displayIcon: rft.displayIcon ?? "tabler:note",
            definitionSource: "action",
            linkedDataTypeIdentifiers: rft.linkedDataTypes ?? [],
            signature: rft.signature,
        } as RuntimeFlowType)),
        functionDefinitions: data.functions.map(f => ({
            runtimeName: f.runtimeName,
            runtimeDefinitionName: f.runtimeDefinitionName,
            signature: f.signature,
            throwsError: f.throwsError ?? false,
            name: f.name ?? [],
            description: f.description ?? [],
            documentation: f.documentation ?? [],
            deprecationMessage: f.deprecationMessage ?? [],
            displayMessage: f.displayMessage ?? [],
            alias: f.alias ?? [],
            linkedDataTypeIdentifiers: f.linkedDataTypes ?? [],
            displayIcon: f.displayIcon ?? "tabler:note",
            version: data.version,
            definitionSource: "action",
            parameterDefinitions: (f.parameters ?? []).map(p => ({
                runtimeName: p.runtimeName,
                runtimeDefinitionName: p.runtimeDefinitionName ?? p.runtimeName,
                name: p.name ?? [],
                description: p.description ?? [],
                documentation: p.documentation ?? [],
                hidden: p.hidden ?? false,
                optional: p.optional ?? false,
                defaultValue: p.defaultValue != null ? constructValue(p.defaultValue) : undefined,
            })),
        })),
        runtimeFunctionDefinitions: data.runtimeFunctions.map(f => ({
            runtimeName: f.runtimeName,
            signature: f.signature,
            throwsError: f.throwsError ?? false,
            name: f.name ?? [],
            description: f.description ?? [],
            documentation: f.documentation ?? [],
            deprecationMessage: f.deprecationMessage ?? [],
            displayMessage: f.displayMessage ?? [],
            alias: f.alias ?? [],
            linkedDataTypeIdentifiers: f.linkedDataTypes ?? [],
            displayIcon: f.displayIcon ?? "tabler:note",
            version: data.version,
            definitionSource: "action",
            runtimeParameterDefinitions: (f.parameters ?? []).map(p => ({
                runtimeName: p.runtimeName,
                name: p.name ?? [],
                description: p.description ?? [],
                documentation: p.documentation ?? [],
                hidden: p.hidden ?? false,
                optional: p.optional ?? false,
                defaultValue: p.defaultValue != null ? constructValue(p.defaultValue) : undefined,
            })),
        })),
        definitions: [],
    };
}
