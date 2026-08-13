"""Module builder (port of ``src/internal/module-builder.ts``).

Assembles the tucana ``shared.Module`` protobuf message from the registered
definitions.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Union

from hercules._tucana.helpers import construct_value
from tucana.generated.shared import (
    data_type_pb2,
    flow_type_pb2,
    function_pb2,
    module_pb2,
    runtime_flow_type_pb2,
    runtime_function_pb2,
    translation_pb2,
)
from hercules.models.datatype import DataTypeProps
from hercules.models.event import EventModel
from hercules.models.function import FunctionProps
from hercules.models.runtime_event import RuntimeEventProps
from hercules.models.runtime_function import RuntimeFunctionProps
from hercules.types import ConfigurationDefinition, Translation

_NONE = flow_type_pb2.FlowTypeSetting.UniquenessScope.NONE


@dataclass
class ModuleBuildData:
    identifier: str
    version: str
    author: str
    icon: str
    documentation: str
    name: List[Translation]
    configuration_definitions: List[ConfigurationDefinition]
    data_types: List[DataTypeProps]
    events: List[EventModel]
    runtime_events: List[RuntimeEventProps]
    functions: List[FunctionProps]
    runtime_functions: List[RuntimeFunctionProps]


def _translations(items) -> List[translation_pb2.Translation]:
    result = []
    for item in items or []:
        if isinstance(item, Translation):
            result.append(translation_pb2.Translation(code=item.code, content=item.content))
        elif isinstance(item, dict):
            result.append(
                translation_pb2.Translation(code=item["code"], content=item["content"])
            )
        else:
            result.append(translation_pb2.Translation(code=item.code, content=item.content))
    return result


def _to_uniqueness_scope(unique: Optional[Union[int, str]]) -> int:
    if unique is None:
        return _NONE
    if isinstance(unique, str):
        scope = flow_type_pb2.FlowTypeSetting.UniquenessScope.Value(unique)
        return scope
    return unique


def _config_def(def_: ConfigurationDefinition, version: str) -> module_pb2.ModuleConfigurationDefinition:
    kwargs = dict(
        identifier=def_.identifier,
        name=_translations(def_.name),
        description=_translations(def_.description),
        type=def_.type,
        linked_data_type_identifiers=def_.linked_data_types or [],
        optional=def_.optional or False,
        hidden=def_.hidden or False,
    )
    if def_.default_value is not None:
        kwargs["default_value"] = construct_value(def_.default_value)
    return module_pb2.ModuleConfigurationDefinition(**kwargs)


def _data_type(dt: DataTypeProps, version: str) -> data_type_pb2.DefinitionDataType:
    return data_type_pb2.DefinitionDataType(
        identifier=dt.identifier,
        name=_translations(dt.name),
        alias=_translations(dt.alias),
        rules=list(dt.rules or []),
        generic_keys=list(dt.generic_keys or []),
        type=dt.type,
        linked_data_type_identifiers=[],
        display_message=_translations(dt.display_message),
        version=version,
        definition_source="action",
    )


def _flow_type_setting(s, version: str) -> flow_type_pb2.FlowTypeSetting:
    kwargs = dict(
        identifier=s.identifier,
        unique=_to_uniqueness_scope(s.unique),
        name=_translations(s.name),
        description=_translations(s.description),
        optional=s.optional or False,
        hidden=s.hidden or False,
    )
    if s.default_value is not None:
        kwargs["default_value"] = construct_value(s.default_value)
    return flow_type_pb2.FlowTypeSetting(**kwargs)


def _flow_type(ft: EventModel, version: str) -> flow_type_pb2.FlowType:
    return flow_type_pb2.FlowType(
        identifier=ft.identifier,
        settings=[_flow_type_setting(s, version) for s in (ft.settings or [])],
        editable=ft.editable or False,
        name=_translations(ft.name),
        description=_translations(ft.description),
        documentation=_translations(ft.documentation),
        display_message=_translations(ft.display_message),
        alias=_translations(ft.alias),
        version=version,
        display_icon=ft.display_icon or "tabler:note",
        definition_source="action",
        linked_data_type_identifiers=[],
        signature=ft.signature,
        runtime_identifier=ft.runtime_identifier or ft.identifier,
    )


def _runtime_flow_type_setting(s, version: str) -> runtime_flow_type_pb2.RuntimeFlowTypeSetting:
    kwargs = dict(
        identifier=s.identifier,
        unique=_to_uniqueness_scope(s.unique),
        name=_translations(s.name),
        description=_translations(s.description),
        optional=s.optional or False,
        hidden=s.hidden or False,
    )
    if s.default_value is not None:
        kwargs["default_value"] = construct_value(s.default_value)
    return runtime_flow_type_pb2.RuntimeFlowTypeSetting(**kwargs)


def _runtime_flow_type(rft: RuntimeEventProps, version: str) -> runtime_flow_type_pb2.RuntimeFlowType:
    return runtime_flow_type_pb2.RuntimeFlowType(
        identifier=rft.identifier,
        runtime_settings=[_runtime_flow_type_setting(s, version) for s in (rft.settings or [])],
        editable=rft.editable or False,
        name=_translations(rft.name),
        description=_translations(rft.description),
        documentation=_translations(rft.documentation),
        display_message=_translations(rft.display_message),
        alias=_translations(rft.alias),
        version=version,
        display_icon=rft.display_icon or "tabler:note",
        definition_source="action",
        linked_data_type_identifiers=[],
        signature=rft.signature,
    )


def _parameter_definition(p, version: str) -> function_pb2.ParameterDefinition:
    kwargs = dict(
        runtime_name=p.runtime_name,
        runtime_definition_name=p.runtime_definition_name or p.runtime_name,
        name=_translations(p.name),
        description=_translations(p.description),
        documentation=_translations(p.documentation),
        hidden=p.hidden or False,
        optional=p.optional or False,
    )
    if p.default_value is not None:
        kwargs["default_value"] = construct_value(p.default_value)
    return function_pb2.ParameterDefinition(**kwargs)


def _function_definition(f: FunctionProps, version: str) -> function_pb2.FunctionDefinition:
    kwargs = dict(
        runtime_name=f.runtime_name,
        runtime_definition_name=f.runtime_definition_name,
        signature=f.signature,
        throws_error=f.throws_error or False,
        name=_translations(f.name),
        description=_translations(f.description),
        documentation=_translations(f.documentation),
        deprecation_message=_translations(f.deprecation_message),
        display_message=_translations(f.display_message),
        alias=_translations(f.alias),
        linked_data_type_identifiers=[],
        display_icon=f.display_icon or "tabler:note",
        version=version,
        definition_source="action",
        parameter_definitions=[_parameter_definition(p, version) for p in (f.parameters or [])],
    )
    if f.design is not None:
        kwargs["design"] = f.design
    return function_pb2.FunctionDefinition(**kwargs)


def _runtime_parameter_definition(p, version: str) -> runtime_function_pb2.RuntimeParameterDefinition:
    kwargs = dict(
        runtime_name=p.runtime_name,
        name=_translations(p.name),
        description=_translations(p.description),
        documentation=_translations(p.documentation),
        hidden=p.hidden or False,
        optional=p.optional or False,
    )
    if p.default_value is not None:
        kwargs["default_value"] = construct_value(p.default_value)
    return runtime_function_pb2.RuntimeParameterDefinition(**kwargs)


def _runtime_function_definition(f: RuntimeFunctionProps, version: str) -> runtime_function_pb2.RuntimeFunctionDefinition:
    kwargs = dict(
        runtime_name=f.runtime_name,
        signature=f.signature,
        throws_error=f.throws_error or False,
        name=_translations(f.name),
        description=_translations(f.description),
        documentation=_translations(f.documentation),
        deprecation_message=_translations(f.deprecation_message),
        display_message=_translations(f.display_message),
        alias=_translations(f.alias),
        linked_data_type_identifiers=[],
        display_icon=f.display_icon or "tabler:note",
        version=version,
        definition_source="action",
        runtime_parameter_definitions=[
            _runtime_parameter_definition(p, version) for p in (f.parameters or [])
        ],
    )
    if f.design is not None:
        kwargs["design"] = f.design
    return runtime_function_pb2.RuntimeFunctionDefinition(**kwargs)


def build_module(data: ModuleBuildData) -> module_pb2.Module:
    version = data.version
    return module_pb2.Module(
        identifier=data.identifier,
        version=version,
        author=data.author,
        icon=data.icon,
        documentation=data.documentation,
        name=_translations(data.name),
        description=[],
        definition_source="action",
        configurations=[_config_def(c, version) for c in data.configuration_definitions],
        definition_data_types=[_data_type(dt, version) for dt in data.data_types],
        flow_types=[_flow_type(ft, version) for ft in data.events],
        runtime_flow_types=[_runtime_flow_type(rft, version) for rft in data.runtime_events],
        function_definitions=[_function_definition(f, version) for f in data.functions],
        runtime_function_definitions=[
            _runtime_function_definition(f, version) for f in data.runtime_functions
        ],
        definitions=[],
    )
