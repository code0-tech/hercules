"""Function mapping (port of ``src/map/function.map.ts``)."""
from __future__ import annotations

from dataclasses import replace
from typing import List

from hercules._metadata import get_metadata
from hercules.map.runtime_function import runtime_function_map
from hercules.models.function import FunctionParameterProps, FunctionProps


def function_map(klass: type) -> FunctionProps:
    parent_class = klass.__bases__[0]
    runtime_function = runtime_function_map(parent_class)

    identifier = get_metadata("hercules:identifier", klass)
    function_parameters: List[FunctionParameterProps] = (
        get_metadata("hercules:function_parameters", klass) or []
    )
    name = get_metadata("hercules:name", klass)
    display_message = get_metadata("hercules:display_message", klass)
    description = get_metadata("hercules:description", klass)
    deprecation_message = get_metadata("hercules:deprecation_message", klass)
    alias = get_metadata("hercules:alias", klass)
    documentation = get_metadata("hercules:documentation", klass)
    signature = get_metadata("hercules:signature", klass)
    display_icon = get_metadata("hercules:display_icon", klass)
    throws_error = get_metadata("hercules:throws_error", klass)
    design = get_metadata("hercules:design", klass)

    runtime_params = runtime_function.parameters or []
    if len(function_parameters) > len(runtime_params):
        raise ValueError(
            f"Function definition class {klass.__name__} has more function "
            f"parameters than its runtime function."
        )

    for fp in function_parameters:
        if not any(p.runtime_name == fp.runtime_name for p in runtime_params):
            raise ValueError(
                f"Function definition class {klass.__name__} has a function "
                f'parameter "{fp.runtime_name}" that does not exist in its '
                f"runtime function."
            )

    merged: List[FunctionParameterProps] = list(function_parameters)
    for rp in runtime_params:
        if not any(p.runtime_name == rp.runtime_name for p in merged):
            merged.append(replace(rp, runtime_definition_name=rp.runtime_name))

    return FunctionProps(
        runtime_definition_name=runtime_function.runtime_name,
        runtime_name=identifier or runtime_function.runtime_name,
        signature=signature or runtime_function.signature,
        throws_error=throws_error if throws_error is not None else runtime_function.throws_error,
        alias=alias or runtime_function.alias,
        description=description or runtime_function.description,
        name=name or runtime_function.name,
        documentation=documentation or runtime_function.documentation,
        deprecation_message=deprecation_message or runtime_function.deprecation_message,
        display_message=display_message or runtime_function.display_message,
        display_icon=display_icon or runtime_function.display_icon,
        design=design or runtime_function.design,
        parameters=[
            replace(
                p,
                runtime_definition_name=p.runtime_definition_name or p.runtime_name,
                name=p.name or [],
                description=p.description or [],
                documentation=p.documentation or [],
                hidden=p.hidden or False,
                optional=p.optional or False,
            )
            for p in merged
        ],
    )
