"""Inline ``${signature}`` reference resolution (port of ``src/internal/literal.ts``).

Resolves an ``aquila.ActionLiteralValue`` into a plain Python value, substituting
every ``${signature}`` placeholder inside a (possibly nested) string leaf with the
value of the matching inline reference.
"""
from __future__ import annotations

import json
import re
from typing import Optional

from hercules._tucana.helpers import PlainValue, to_allowed_value
from hercules.types import RuntimeError
from tucana.generated.shared import struct_pb2

__all__ = ["resolve_literal", "resolve_node_value", "to_sub_flow_caller"]

# Matches every ``${signature}`` placeholder inside a string.
_REFERENCE_PATTERN = re.compile(r"\$\{([^}]+)\}")
# Matches a string that consists of exactly one ``${signature}`` placeholder.
# ``\A``/``\Z`` (not ``^``/``$``) so a trailing newline is not treated as a sole match,
# mirroring JavaScript's ``$`` anchor.
_SOLE_REFERENCE_PATTERN = re.compile(r"\A\$\{([^}]+)\}\Z")


def to_sub_flow_caller(action, sub_flow):
    """Wrap a sub flow value in an awaitable caller exposing its declared I/O schema."""

    async def caller(*args):
        return await action.execute_sub_flow(sub_flow, *args)

    # Expose the sub flow's declared I/O so the handler can inspect it.
    caller.input_schema = sub_flow.input_schema
    caller.output_schema = sub_flow.output_schema
    return caller


def resolve_node_value(action, node):
    """Resolve a single parameter node into a concrete value.

    Literal values have their inline ``${signature}`` references substituted; sub
    flows become awaitable callers. A missing node resolves to ``None``.
    """
    which = node.WhichOneof("value") if node is not None else None
    if which == "literal_value":
        return resolve_literal(action, node.literal_value)
    if which == "sub_flow":
        return to_sub_flow_caller(action, node.sub_flow)
    return None


def resolve_literal(action, literal):
    """Resolve an ``ActionLiteralValue`` into a plain value.

    A string that is exactly ``${signature}`` adopts the referenced value verbatim
    (preserving its type); mixed strings interpolate the referenced value as text.
    Unknown signatures are left untouched.
    """
    references = {}
    for reference in literal.references:
        references[reference.signature] = resolve_node_value(action, reference.value)
    if literal.HasField("value"):
        return _resolve_value(literal.value, references)
    return None


def _resolve_value(value: struct_pb2.Value, references: dict):
    kind = value.WhichOneof("kind")
    if kind == "string_value":
        return _resolve_string(value.string_value, references)
    if kind == "struct_value":
        return {k: _resolve_value(v, references) for k, v in value.struct_value.fields.items()}
    if kind == "list_value":
        return [_resolve_value(v, references) for v in value.list_value.values]
    # Numbers, booleans and null cannot carry placeholders.
    return to_allowed_value(value)


def _resolve_string(raw: str, references: dict):
    sole = _SOLE_REFERENCE_PATTERN.match(raw)
    if sole is not None:
        signature = sole.group(1)
        # Adopt the referenced value verbatim so its type (number, dict, sub flow, ...) is preserved.
        return references[signature] if signature in references else raw

    def replace(match: "re.Match[str]") -> str:
        signature = match.group(1)
        if signature in references:
            return _stringify_reference(signature, references[signature])
        return match.group(0)

    return _REFERENCE_PATTERN.sub(replace, raw)


def _stringify_reference(signature: str, value: Optional[PlainValue]) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if callable(value):
        # A sub flow has no textual form, so it cannot be interpolated into a string.
        raise RuntimeError(
            "INLINE_REFERENCE_NOT_STRINGIFIABLE",
            f"Inline reference ${{{signature}}} resolves to a sub flow and cannot be interpolated into a string",
        )
    if isinstance(value, bool):
        # Match the cross-SDK textual form ("true"/"false"), not Python's "True"/"False".
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    # dict / list -> compact JSON, matching the TS ``JSON.stringify`` output.
    return json.dumps(value, separators=(",", ":"))
