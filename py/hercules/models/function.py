"""Function definition models (port of ``src/models/function.model.ts``)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from hercules._tucana.helpers import PlainValue
from hercules.types import Translation


@dataclass
class FunctionParameterProps:
    runtime_name: str
    default_value: Optional[PlainValue] = None
    name: Optional[List[Translation]] = None
    description: Optional[List[Translation]] = None
    documentation: Optional[List[Translation]] = None
    hidden: Optional[bool] = None
    optional: Optional[bool] = None
    runtime_definition_name: Optional[str] = None


@dataclass
class FunctionProps:
    runtime_definition_name: str
    runtime_name: str
    signature: str
    parameters: Optional[List[FunctionParameterProps]] = None
    throws_error: Optional[bool] = None
    name: Optional[List[Translation]] = None
    description: Optional[List[Translation]] = None
    documentation: Optional[List[Translation]] = None
    deprecation_message: Optional[List[Translation]] = None
    display_message: Optional[List[Translation]] = None
    alias: Optional[List[Translation]] = None
    display_icon: Optional[str] = None
    design: Optional[str] = None
