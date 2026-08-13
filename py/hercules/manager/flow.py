"""Flow manager (port of ``src/manager/FlowManager.ts``).

Registry of the action's own flows, kept in sync via ActionFlowUpdate messages.
Keyed by flow id.
"""
from __future__ import annotations

from hercules.manager.base import BaseManager


class FlowManager(BaseManager):
    pass
