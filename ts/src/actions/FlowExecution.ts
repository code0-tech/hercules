import type {ActionFlowExecutionResponse} from "@code0-tech/tucana/aquila";
import {CodeZeroEvent} from "../events";
import type {Action} from "../action";

export const packetType = "flowExecutionResponse";

export function handle(action: Action, response: ActionFlowExecutionResponse): void {
    action.emit(CodeZeroEvent.flowExecutionResponseReceived, response);
    action.resolveExecutionResponse(response.executionIdentifier, response.result);
}
