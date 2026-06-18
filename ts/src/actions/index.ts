import type {Action} from "../action";
import * as ModuleConfigurations from "./ModuleConfigurations";
import * as Execution from "./Execution";

export interface ActionHandler {
    packetType: string;
    handle(action: Action, data: unknown): void;
}

export const actions: ActionHandler[] = [
    ModuleConfigurations,
    Execution,
];
