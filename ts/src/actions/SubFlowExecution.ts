import type {ActionSubFlowExecutionResponse} from "@code0-tech/tucana/aquila";
import {CodeZeroEvent} from "../events";
import type {Action} from "../action";

export const packetType = "subFlowExecutionResponse";

export function handle(action: Action, response: ActionSubFlowExecutionResponse): void {
    action.emit(CodeZeroEvent.subFlowExecutionResponseReceived, response);
    action.resolveExecutionResponse(response.executionIdentifier, response.result);
}
