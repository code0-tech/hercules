"""Runtime function models (port of ``src/models/runtime_function.model.ts``)."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Optional

from hercules._tucana.helpers import PlainValue
from hercules.models.function import FunctionParameterProps
from hercules.types import Translation


class RuntimeFunctionRunnable:
    """Base class for runtime functions. Subclasses implement ``run``."""

    def run(self, *args):  # pragma: no cover - overridden by subclasses
        raise NotImplementedError


@dataclass
class RuntimeFunctionProps:
    runtime_name: str
    signature: str
    handler: Callable[..., PlainValue]
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
