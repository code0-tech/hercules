"""Sub flow function manager (port of ``src/manager/SubFlowFunctionManager.ts``)."""
from __future__ import annotations

from hercules.manager.base import BaseManager


class SubFlowFunctionManager(BaseManager):
    """Sub flow functions a runtime function returned at execution time.

    Keyed by the identifier reported to Aquila. Unlike the other managers this one is
    not filled by registering classes up front: entries appear while the action runs
    (see :meth:`hercules.action.Action.register_sub_flow_function`).
    """

    pass
