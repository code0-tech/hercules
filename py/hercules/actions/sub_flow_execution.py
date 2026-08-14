"""Sub flow execution response handler.

Port of ``src/actions/SubFlowExecution.ts``.
"""
from __future__ import annotations

from hercules.events import CodeZeroEvent

packet_type = "sub_flow_execution_response"


def handle(action, response) -> None:
    action.emit(CodeZeroEvent.sub_flow_execution_response_received, response)
    action.resolve_execution_response(response.correlation_identifier, response)
