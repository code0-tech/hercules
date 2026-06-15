import type {CodeZeroAction} from "../CodeZeroAction.ts";
import * as ModuleConfigurations from "./ModuleConfigurations.ts";
import * as Execution from "./Execution.ts";

export interface Action {
    packetType: string;
    handle(action: CodeZeroAction, data: unknown): void;
}

export const actions: Action[] = [
    ModuleConfigurations,
    Execution,
];
