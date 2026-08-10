import type {Action} from "../action";
import * as ModuleConfigurations from "./ModuleConfigurations";
import * as Execution from "./Execution";
import * as SubFlowExecution from "./SubFlowExecution";
import * as FlowExecution from "./FlowExecution";
import * as FlowUpdate from "./FlowUpdate";

export interface ActionHandler {
    packetType: string;
    handle(action: Action, data: unknown): void;
}

export const actions: ActionHandler[] = [
    ModuleConfigurations,
    Execution,
    SubFlowExecution,
    FlowExecution,
    FlowUpdate,
];
