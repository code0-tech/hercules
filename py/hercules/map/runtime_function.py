"""Runtime function mapping (port of ``src/map/runtime_function.map.ts``)."""
from __future__ import annotations

from dataclasses import replace

from hercules._metadata import get_metadata
from hercules.models.function import FunctionParameterProps
from hercules.models.runtime_function import RuntimeFunctionProps


def _fill_parameter(param: FunctionParameterProps) -> FunctionParameterProps:
    return replace(
        param,
        name=param.name or [],
        description=param.description or [],
        documentation=param.documentation or [],
        hidden=param.hidden or False,
        optional=param.optional or False,
    )


def runtime_function_map(klass: type) -> RuntimeFunctionProps:
    identifier = get_metadata("hercules:identifier", klass)
    runtime_parameters = get_metadata("hercules:function_parameters", klass) or []
    name = get_metadata("hercules:name", klass) or []
    display_message = get_metadata("hercules:display_message", klass) or []
    description = get_metadata("hercules:description", klass) or []
    deprecation_message = get_metadata("hercules:deprecation_message", klass) or []
    alias = get_metadata("hercules:alias", klass) or []
    documentation = get_metadata("hercules:documentation", klass) or []
    signature = get_metadata("hercules:signature", klass)
    display_icon = get_metadata("hercules:display_icon", klass) or ""
    throws_error = get_metadata("hercules:throws_error", klass) or False
    design = get_metadata("hercules:design", klass)

    if not identifier:
        raise ValueError(
            f"Runtime function class {klass.__name__} is missing an identifier. "
            f'Add @Identifier("your_identifier") to the class.'
        )
    if not signature:
        raise ValueError(
            f"Runtime function class {klass.__name__} is missing a signature. "
            f'Add @Signature("(param1: TYPE_1): RETURN_TYPE") to the class.'
        )

    instance = klass()
    handler = instance.run

    return RuntimeFunctionProps(
        runtime_name=identifier,
        signature=signature,
        throws_error=throws_error,
        name=name,
        description=description,
        documentation=documentation,
        deprecation_message=deprecation_message,
        display_message=display_message,
        alias=alias,
        display_icon=display_icon or "tabler:note",
        design=design,
        parameters=[_fill_parameter(p) for p in runtime_parameters],
        handler=handler,
    )
