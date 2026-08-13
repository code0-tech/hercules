"""Action packet handlers (port of ``src/actions/index.ts``)."""
from __future__ import annotations

from hercules.actions import (
    execution,
    flow_execution,
    flow_update,
    module_configurations,
    sub_flow_execution,
)

# Ordered list of handlers, keyed by their protobuf ``data`` oneof field name.
actions = [
    module_configurations,
    execution,
    sub_flow_execution,
    flow_execution,
    flow_update,
]

__all__ = ["actions"]
