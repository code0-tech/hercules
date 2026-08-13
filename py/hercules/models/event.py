"""Event (flow type) models (port of ``src/models/event.model.ts``)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Union

from hercules._tucana.helpers import PlainValue
from hercules.types import FlowTypeSetting_UniquenessScope, Translation


@dataclass
class EventSettingProps:
    identifier: str
    unique: Optional[Union[int, str]] = None
    linked_data_type_identifiers: Optional[List[str]] = None
    default_value: Optional[PlainValue] = None
    name: Optional[List[Translation]] = None
    description: Optional[List[Translation]] = None
    optional: Optional[bool] = None
    hidden: Optional[bool] = None


@dataclass
class EventModel:
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
    runtime_identifier: Optional[str] = None
