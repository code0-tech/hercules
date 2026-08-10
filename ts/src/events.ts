import type {
    ActionExecutionRequest,
    ActionFlow,
    ActionFlowExecutionResponse,
    ActionSubFlowExecutionResponse,
    ActionTransferRequest,
    ActionTransferResponse
} from "@code0-tech/tucana/aquila";
import type {ModuleConfigurations} from "@code0-tech/tucana/shared";
import type {Action} from "./action.ts";

export enum CodeZeroEvent {
    error = "error",
    connected = "connected",
    streamMessageReceived = "streamMessageReceived",
    streamMessageSent = "streamMessageSent",
    moduleUpdated = "moduleUpdated",
    executionRequestReceived = "executionRequestReceived",
    subFlowExecutionResponseReceived = "subFlowExecutionResponseReceived",
    flowExecutionResponseReceived = "flowExecutionResponseReceived",
    flowUpdated = "flowUpdated",
    flowDeleted = "flowDeleted",
}

export interface CodeZeroEventMap {
    [CodeZeroEvent.error]: [Error]
    [CodeZeroEvent.connected]: [Action]
    [CodeZeroEvent.streamMessageReceived]: [ActionTransferResponse]
    [CodeZeroEvent.streamMessageSent]: [ActionTransferRequest]
    [CodeZeroEvent.moduleUpdated]: [ModuleConfigurations]
    [CodeZeroEvent.executionRequestReceived]: [ActionExecutionRequest]
    [CodeZeroEvent.subFlowExecutionResponseReceived]: [ActionSubFlowExecutionResponse]
    [CodeZeroEvent.flowExecutionResponseReceived]: [ActionFlowExecutionResponse]
    [CodeZeroEvent.flowUpdated]: [ActionFlow]
    [CodeZeroEvent.flowDeleted]: [bigint]
    [key: string]: unknown[]
}
