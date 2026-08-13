"""Struct <-> plain value helpers.

Python port of ``@code0-tech/tucana/helpers`` (``shared.struct_helper``).
Converts between the protobuf ``shared.Value`` message and plain Python values.
"""
from __future__ import annotations

from typing import Union

from tucana.generated.shared import struct_pb2

# Mirror of the TS ``PlainValue`` union.
PlainValue = Union[None, bool, int, float, str, list, dict]

__all__ = ["PlainValue", "construct_value", "to_allowed_value"]


def to_allowed_value(value: struct_pb2.Value) -> PlainValue:
    """Convert a protobuf ``Value`` into a plain Python value."""
    kind = value.WhichOneof("kind")
    if kind is None or kind == "null_value":
        return None
    if kind == "number_value":
        number = value.number_value
        which = number.WhichOneof("number")
        if which == "integer":
            return int(number.integer)
        if which == "float":
            return number.float
        raise ValueError(f"Unsupported NumberValue number kind: {which}")
    if kind == "string_value":
        return value.string_value
    if kind == "bool_value":
        return value.bool_value
    if kind == "list_value":
        return [to_allowed_value(v) for v in value.list_value.values]
    if kind == "struct_value":
        return {k: to_allowed_value(v) for k, v in value.struct_value.fields.items()}
    raise ValueError(f"Unsupported Value kind: {kind}")


def construct_value(value: PlainValue) -> struct_pb2.Value:
    """Convert a plain Python value into a protobuf ``Value``."""
    if value is None:
        return struct_pb2.Value(null_value=struct_pb2.NULL_VALUE)
    # bool must be checked before int (bool is a subclass of int in Python).
    if isinstance(value, bool):
        return struct_pb2.Value(bool_value=value)
    if isinstance(value, int):
        return struct_pb2.Value(
            number_value=struct_pb2.NumberValue(integer=value)
        )
    if isinstance(value, float):
        if value.is_integer():
            return struct_pb2.Value(
                number_value=struct_pb2.NumberValue(integer=int(value))
            )
        return struct_pb2.Value(number_value=struct_pb2.NumberValue(float=value))
    if isinstance(value, str):
        return struct_pb2.Value(string_value=value)
    if isinstance(value, (list, tuple)):
        return struct_pb2.Value(
            list_value=struct_pb2.ListValue(
                values=[construct_value(v) for v in value]
            )
        )
    if isinstance(value, dict):
        return struct_pb2.Value(
            struct_value=struct_pb2.Struct(
                fields={k: construct_value(v) for k, v in value.items()}
            )
        )
    raise ValueError(f"Unsupported value type: {type(value).__name__}")
