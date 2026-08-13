"""Flow execution response handler (port of ``src/actions/FlowExecution.ts``)."""
from __future__ import annotations

from hercules.events import CodeZeroEvent

packet_type = "flow_execution_response"


def handle(action, response) -> None:
    action.emit(CodeZeroEvent.flow_execution_response_received, response)
    action.resolve_execution_response(response.execution_identifier, response)
