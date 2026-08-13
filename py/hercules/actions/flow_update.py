"""Flow update handler (port of ``src/actions/FlowUpdate.ts``)."""
from __future__ import annotations

from hercules.events import CodeZeroEvent

packet_type = "flow_update"


def handle(action, update) -> None:
    which = update.WhichOneof("data")
    if which == "updated_flow":
        flow = update.updated_flow
        action.flows.set(flow.flow_id, flow)
        action.emit(CodeZeroEvent.flow_updated, flow)
    elif which == "deleted_flow":
        flow_id = update.deleted_flow
        action.flows.delete(flow_id)
        action.emit(CodeZeroEvent.flow_deleted, flow_id)
