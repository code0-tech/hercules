import type {CodeZeroAction} from "../CodeZeroAction";
import * as ModuleConfigurations from "./ModuleConfigurations";
import * as Execution from "./Execution";

export interface Action {
    packetType: string;
    handle(action: CodeZeroAction, data: unknown): void;
}

export const actions: Action[] = [
    ModuleConfigurations,
    Execution,
];
