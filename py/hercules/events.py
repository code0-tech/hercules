"""Event names (port of ``src/events.ts``)."""
from __future__ import annotations

from enum import Enum


class CodeZeroEvent(str, Enum):
    error = "error"
    connected = "connected"
    stream_message_received = "streamMessageReceived"
    stream_message_sent = "streamMessageSent"
    module_updated = "moduleUpdated"
    execution_request_received = "executionRequestReceived"
    sub_flow_execution_response_received = "subFlowExecutionResponseReceived"
    flow_execution_response_received = "flowExecutionResponseReceived"
    flow_updated = "flowUpdated"
    flow_deleted = "flowDeleted"

    def __str__(self) -> str:  # so it can be used interchangeably with the value
        return self.value


__all__ = ["CodeZeroEvent"]
