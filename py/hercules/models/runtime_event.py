"""Runtime event (runtime flow type) models.

Port of ``src/models/runtime_event.model.ts``.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

from hercules.models.event import EventSettingProps
from hercules.types import Translation


class RuntimeEventRunnable:
    """Base class for runtime events (runtime flow types)."""


@dataclass
class RuntimeEventProps:
    identifier: str
    signature: str
    settings: Optional[List[EventSettingProps]] = None
    editable: Optional[bool] = None
    name: Optional[List[Translation]] = None
    description: Optional[List[Translation]] = None
    documentation: Optional[List[Translation]] = None
    display_message: Optional[List[Translation]] = None
    alias: Optional[List[Translation]] = None
    display_icon: Optional[str] = None
