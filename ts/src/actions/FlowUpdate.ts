import type {ActionFlowUpdate} from "@code0-tech/tucana/aquila";
import {CodeZeroEvent} from "../events";
import type {Action} from "../action";

export const packetType = "flowUpdate";

export function handle(action: Action, update: ActionFlowUpdate): void {
    if (update.data.oneofKind === "updatedFlow") {
        const flow = update.data.updatedFlow;
        action.flows.set(flow.flowId, flow);
        action.emit(CodeZeroEvent.flowUpdated, flow);
    } else if (update.data.oneofKind === "deletedFlow") {
        const flowId = update.data.deletedFlow;
        action.flows.delete(flowId);
        action.emit(CodeZeroEvent.flowDeleted, flowId);
    }
}
