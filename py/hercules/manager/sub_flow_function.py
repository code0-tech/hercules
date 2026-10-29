"""Sub flow function manager (port of ``src/manager/SubFlowFunctionManager.ts``)."""
from __future__ import annotations

import asyncio
import time
from typing import Dict, Optional

from hercules.manager.base import BaseManager

#: How long a returned sub flow function stays in memory and invocable: 30 minutes.
SUB_FLOW_FUNCTION_TTL_SECONDS = 30 * 60


class SubFlowFunctionManager(BaseManager):
    """Sub flow functions a runtime function returned at execution time.

    Keyed by the identifier reported to Aquila. Unlike the other managers this one is
    not filled by registering classes up front: entries appear while the action runs
    (see :meth:`hercules.action.Action.register_sub_flow_function`).

    Each entry has a maximum lifetime of :data:`SUB_FLOW_FUNCTION_TTL_SECONDS`,
    counted from when it was registered and never extended by an invocation, so a flow
    that holds a function forever cannot grow the registry without bound. Expired
    entries are dropped by a sweep scheduled for the next expiry, and on any read or
    write, so an expired function is never invoked even if the sweep could not run
    (there is no running event loop to schedule it on, for instance).
    """

    def __init__(self, ttl_seconds: float = SUB_FLOW_FUNCTION_TTL_SECONDS) -> None:
        super().__init__()
        self._ttl_seconds = ttl_seconds
        # Expiry per key. Insertion order is expiry order, since the TTL is fixed.
        self._expiries: Dict[str, float] = {}
        self._sweep_handle: Optional[asyncio.TimerHandle] = None

    @staticmethod
    def _now() -> float:
        # Monotonic, so a system clock change cannot postpone or trigger an expiry.
        return time.monotonic()

    def set(self, key, value):
        # Re-insert the expiry so a replaced key moves to the back and the dict stays
        # ordered by expiry.
        self._expiries.pop(key, None)
        super().set(key, value)
        self._expiries[key] = self._now() + self._ttl_seconds
        self.prune()
        return self

    def get(self, key):
        self.prune()
        return super().get(key)

    def has(self, key) -> bool:
        self.prune()
        return super().has(key)

    def delete(self, key) -> bool:
        self._expiries.pop(key, None)
        deleted = super().delete(key)
        self._schedule_sweep(self._now())
        return deleted

    def clear(self) -> None:
        self._expiries.clear()
        super().clear()
        self._schedule_sweep(self._now())

    def prune(self, now: Optional[float] = None) -> None:
        """Drop every entry whose lifetime has passed, then schedule the next sweep."""
        if now is None:
            now = self._now()
        for key, expires_at in list(self._expiries.items()):
            # Ordered by expiry, so the first entry still alive ends the sweep.
            if expires_at > now:
                break
            del self._expiries[key]
            super().delete(key)
        self._schedule_sweep(now)

    def _schedule_sweep(self, now: float) -> None:
        if self._sweep_handle is not None:
            self._sweep_handle.cancel()
            self._sweep_handle = None
        next_expiry = next(iter(self._expiries.values()), None)
        if next_expiry is None:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # No loop to schedule on; pruning on the next read or write still applies.
            return
        self._sweep_handle = loop.call_later(max(0.0, next_expiry - now), self.prune)
