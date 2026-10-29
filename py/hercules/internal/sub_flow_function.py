"""Sub flow function support (port of ``src/internal/sub-flow-function.ts``).

A runtime function's ``run`` may return a sub flow function instead of raw data.
Hercules registers it on the action and reports it to Aquila as a
``shared.SubFlowFunctionResult``, which the flow can then invoke like any sub flow.
"""
from __future__ import annotations

from typing import Mapping, Optional

from pydantic import BaseModel

from hercules._tucana.helpers import construct_value
from hercules.internal.schema import pydantic_to_json_schema
from hercules.types import (
    RuntimeError,
    SubFlowFunctionDefinition,
    SubFlowFunctionSchema,
)
from tucana.generated.shared import execution_result_pb2, flow_pb2, struct_pb2

__all__ = ["as_sub_flow_function_definition", "build_sub_flow_function_result", "to_struct"]


def as_sub_flow_function_definition(value) -> Optional[SubFlowFunctionDefinition]:
    """Return ``value`` as a definition if ``run`` returned a sub flow function.

    A sub flow function is told apart from raw data by its callable ``run``, which a
    plain value never carries. Both a :class:`SubFlowFunctionDefinition` and a plain
    mapping with the same keys are accepted.
    """
    if isinstance(value, SubFlowFunctionDefinition):
        return value
    if isinstance(value, Mapping) and callable(value.get("run")):
        return SubFlowFunctionDefinition(
            name=value.get("name"),
            description=value.get("description") or "",
            input_schema=value.get("input_schema") or {},
            output_schema=value.get("output_schema") or {},
            run=value["run"],
        )
    return None


def _is_model(schema) -> bool:
    return isinstance(schema, type) and issubclass(schema, BaseModel)


def to_struct(schema: Optional[SubFlowFunctionSchema], mode: str) -> struct_pb2.Struct:
    """Convert a declared schema into the ``shared.Struct`` the protobuf field expects.

    A Pydantic model becomes a JSON schema first: ``mode`` is ``"validation"`` for a
    function's input schema (what it accepts) and ``"serialization"`` for its output
    schema (what it produces).
    """
    if isinstance(schema, struct_pb2.Struct):
        return schema
    if _is_model(schema):
        return construct_value(pydantic_to_json_schema(schema, mode)).struct_value
    return construct_value(schema or {}).struct_value


def build_sub_flow_function_result(
    action, definition: SubFlowFunctionDefinition
) -> execution_result_pb2.SubFlowFunctionResult:
    """Register the sub flow function and build the result reported back to Aquila.

    The identifier in the result is the one Aquila sends back on an execution request
    when the flow invokes the function.
    """
    if not definition.name:
        raise RuntimeError(
            "SUB_FLOW_FUNCTION_MISSING_NAME",
            "A sub flow function returned from a run block must declare a name",
        )
    function_identifier = action.register_sub_flow_function(definition)
    return execution_result_pb2.SubFlowFunctionResult(
        function=flow_pb2.SubFlowFunction(
            function_identifier=function_identifier,
            definition_source="action",
        ),
        name=definition.name,
        description=definition.description or "",
        input_schema=to_struct(definition.input_schema, "validation"),
        output_schema=to_struct(definition.output_schema, "serialization"),
    )
