import type {ActionExecutionRequest, ActionTransferRequest, ActionTransferResponse} from "@code0-tech/tucana/aquila";
import type {ModuleConfigurations} from "@code0-tech/tucana/shared";
import type {CodeZeroAction} from "./CodeZeroAction.ts";

export enum CodeZeroEvent {
    error = "error",
    connected = "connected",
    streamMessageReceived = "streamMessageReceived",
    streamMessageSent = "streamMessageSent",
    moduleUpdated = "moduleUpdated",
    executionRequestReceived = "executionRequestReceived",
}

export interface CodeZeroEventMap {
    [CodeZeroEvent.error]: [Error]
    [CodeZeroEvent.connected]: [CodeZeroAction]
    [CodeZeroEvent.streamMessageReceived]: [ActionTransferResponse]
    [CodeZeroEvent.streamMessageSent]: [ActionTransferRequest]
    [CodeZeroEvent.moduleUpdated]: [ModuleConfigurations]
    [CodeZeroEvent.executionRequestReceived]: [ActionExecutionRequest]
    [key: string]: unknown[]
}
