"""hercules — the action SDK to connect with aquila (Python).

Public API mirror of the TypeScript ``src/index.ts`` re-exports.
"""
from __future__ import annotations

# Must run before any module that imports the tucana protobufs: it puts
# ``tucana/generated`` on sys.path so the generated protos' internal
# ``from shared import ...`` / ``from aquila import ...`` imports resolve.
import hercules._tucana  # noqa: F401  isort: skip

from hercules.types import (
    ConfigurationDefinition,
    FlowTypeSetting_UniquenessScope,
    FunctionContext,
    PlainValue,
    ProjectConfiguration,
    RuntimeError,
    RuntimeFlowTypeSetting_UniquenessScope,
    SubFlow,
    Translation,
)
from hercules.events import CodeZeroEvent
from hercules.schema import (
    Annotated,
    BaseModel,
    ConfigDict,
    Field,
    RootModel,
    StringConstraints,
    Schema as SchemaType,
)
from hercules.decorators.meta import (
    Alias,
    DeprecationMessage,
    Description,
    DisplayIcon,
    DisplayMessage,
    Documentation,
    Editable,
    Identifier,
    Name,
    Signature,
)
from hercules.decorators.function import Design, OmitFunction, Parameter, ThrowsError
from hercules.decorators.datatype import Schema, TypeString
from hercules.decorators.event import EventSetting
from hercules.decorators.runtime_event import OmitEvent
from hercules.decorators.runtime_function import OmitRuntimeFunction
from hercules.manager.base import BaseManager
from hercules.manager.config import ConfigManager
from hercules.manager.datatype import DataTypeManager
from hercules.manager.event import EventManager
from hercules.manager.flow import FlowManager
from hercules.manager.function import FunctionManager
from hercules.manager.runtime_event import RuntimeEventManager
from hercules.manager.runtime_function import RuntimeFunctionManager
from hercules.models.datatype import DataTypeProps, DataTypeRunnable
from hercules.models.event import EventModel, EventSettingProps
from hercules.models.function import FunctionParameterProps, FunctionProps
from hercules.models.runtime_event import RuntimeEventProps, RuntimeEventRunnable
from hercules.models.runtime_function import RuntimeFunctionProps, RuntimeFunctionRunnable
from hercules.action import Action, is_export_mode, registered_actions

__all__ = [
    "Translation", "PlainValue", "SubFlow", "FunctionContext",
    "ProjectConfiguration", "ConfigurationDefinition", "RuntimeError",
    "FlowTypeSetting_UniquenessScope", "RuntimeFlowTypeSetting_UniquenessScope",
    "CodeZeroEvent", "SchemaType",
    "BaseModel", "RootModel", "Field", "StringConstraints", "ConfigDict", "Annotated",
    "Identifier", "Name", "Description", "Documentation", "DisplayMessage",
    "Alias", "DeprecationMessage", "Signature", "DisplayIcon", "Editable",
    "OmitFunction", "Design", "ThrowsError", "Parameter", "Schema", "TypeString",
    "EventSetting", "OmitEvent", "OmitRuntimeFunction",
    "BaseManager", "ConfigManager", "FlowManager", "FunctionManager",
    "RuntimeFunctionManager", "DataTypeManager", "EventManager", "RuntimeEventManager",
    "FunctionProps", "FunctionParameterProps", "RuntimeFunctionProps",
    "RuntimeFunctionRunnable", "DataTypeProps", "DataTypeRunnable", "EventModel",
    "EventSettingProps", "RuntimeEventProps", "RuntimeEventRunnable",
    "Action", "is_export_mode", "registered_actions",
]
