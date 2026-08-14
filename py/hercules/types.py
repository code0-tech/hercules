"""Shared types for the hercules SDK (port of ``src/types.ts``)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, List, Optional, Protocol, Union

from hercules._tucana.helpers import PlainValue
from tucana.generated.shared.flow_type_pb2 import FlowTypeSetting
from tucana.generated.shared.runtime_flow_type_pb2 import RuntimeFlowTypeSetting
from tucana.generated.shared.struct_pb2 import Struct

# Re-export the uniqueness scope enums (mirror the TS re-exports).
FlowTypeSetting_UniquenessScope = FlowTypeSetting.UniquenessScope
RuntimeFlowTypeSetting_UniquenessScope = RuntimeFlowTypeSetting.UniquenessScope

__all__ = [
    "PlainValue",
    "Struct",
    "FlowTypeSetting_UniquenessScope",
    "RuntimeFlowTypeSetting_UniquenessScope",
    "Translation",
    "SubFlow",
    "FunctionContext",
    "ProjectConfiguration",
    "ConfigurationDefinition",
    "RuntimeError",
]


@dataclass
class Translation:
    code: str
    content: str


class SubFlow(Protocol):
    """A sub flow passed as a parameter (e.g. a CONSUMER).

    Call it with the sub flow's parameters to execute it and await its result.
    The input/output schema declared for the sub flow by the caller are exposed
    via :attr:`input_schema` / :attr:`output_schema` (either may be ``None`` if
    the caller omitted it).
    """

    input_schema: Optional[Struct]
    output_schema: Optional[Struct]

    def __call__(self, *args: PlainValue) -> Awaitable[PlainValue]: ...


@dataclass
class ProjectConfiguration:
    project_id: int
    config_values: List[dict] = field(default_factory=list)
    find_config: Callable[[str], Optional[PlainValue]] = lambda identifier: None


@dataclass
class FunctionContext:
    project_id: int
    execution_id: str
    matched_config: ProjectConfiguration
    execute_flow: Callable[..., Awaitable[PlainValue]]


@dataclass
class ConfigurationDefinition:
    identifier: str
    type: str
    name: Optional[List[Translation]] = None
    description: Optional[List[Translation]] = None
    hidden: Optional[bool] = None
    optional: Optional[bool] = None
    linked_data_types: Optional[List[str]] = None
    default_value: Optional[PlainValue] = None


class RuntimeError(Exception):
    """Raised (or reported) when a runtime function fails with a known code."""

    def __init__(self, code: str, description: Optional[str] = None) -> None:
        message = f"Runtime error with code {code} occurred." + (
            f" Description: {description}" if description else ""
        )
        super().__init__(message)
        self.name = "RuntimeErrorException"
        self.code = code
        self.description = description
