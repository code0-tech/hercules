"""Schema registry plus TypeScript type-string and rule generation.

Data types are described with Pydantic models. Registered models are keyed by
class; when a registered model appears nested inside another type it is rendered
as its identifier instead of being inlined, which lets recursive and
mutually-recursive data types resolve by reference (mirroring the TypeScript SDK's
``zod-schema`` behaviour).

The Pydantic ``model_json_schema()`` output is pre-processed here (references to
registered models become ``tsType`` identifier hints, non-registered nested models
are inlined, titles are stripped) and then handed to the Node helper, which turns
it into an inline TypeScript type expression.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional, Type

from pydantic import BaseModel

from tucana.generated.shared import data_type_pb2
from hercules.internal.tsgen import json_schema_to_ts

SchemaModel = Type[BaseModel]

# Maps a registered Pydantic model class -> its data-type identifier.
_registry: Dict[SchemaModel, str] = {}


def register_schema(model: SchemaModel, identifier: str) -> None:
    _registry[model] = identifier


def get_registered_identifier(model: SchemaModel) -> Optional[str]:
    return _registry.get(model)


def _registered_names() -> Dict[str, str]:
    """Map each registered model's JSON-schema definition name to its identifier."""
    return {model.__name__: identifier for model, identifier in _registry.items()}


# JSON-schema annotation keywords that describe rather than shape a type. They
# would otherwise surface as JSDoc comments / noise in the emitted type string.
_ANNOTATION_KEYS = ("title", "description", "default", "examples", "$comment")


def _strip_annotations(node: Any) -> None:
    if isinstance(node, dict):
        for key in _ANNOTATION_KEYS:
            node.pop(key, None)
        for value in node.values():
            _strip_annotations(value)
    elif isinstance(node, list):
        for item in node:
            _strip_annotations(item)


def _resolve(
    node: Any,
    defs: Dict[str, Any],
    names: Dict[str, str],
    self_name: str,
    self_identifier: Optional[str],
    stack: List[str],
) -> Any:
    """Recursively rewrite ``$ref`` nodes.

    References to registered models (and self-references) become ``tsType``
    identifier hints; references to non-registered nested models are inlined so
    the whole type collapses into a single expression. A non-registered recursive
    reference cannot be inlined and raises.
    """
    if isinstance(node, list):
        return [
            _resolve(item, defs, names, self_name, self_identifier, stack)
            for item in node
        ]
    if not isinstance(node, dict):
        return node

    ref = node.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/$defs/"):
        ref_name = ref.split("/")[-1]
        if ref_name in names:
            return {"tsType": names[ref_name]}
        if ref_name == self_name and self_identifier is not None:
            return {"tsType": self_identifier}
        if ref_name in stack:
            subject = (
                f'data type "{self_identifier}"' if self_identifier else "the schema"
            )
            raise ValueError(
                f"Cannot generate a type string for {subject}: it contains "
                f"recursive schemas that cannot be inlined. Register each "
                f"recursive schema as its own data type so it can be referenced "
                f"by identifier."
            )
        target = defs.get(ref_name, {})
        return _resolve(
            target, defs, names, self_name, self_identifier, stack + [ref_name]
        )

    result: Dict[str, Any] = {}
    for key, value in node.items():
        if key in _ANNOTATION_KEYS:
            continue
        result[key] = _resolve(
            value, defs, names, self_name, self_identifier, stack
        )
    return result


def pydantic_to_type_string(model: SchemaModel) -> str:
    schema = model.model_json_schema()
    defs = schema.pop("$defs", {})

    self_identifier = _registry.get(model)
    names = _registered_names()

    ref = schema.get("$ref")
    if isinstance(ref, str) and ref.startswith("#/$defs/"):
        # Self-recursive models put the body under ``$defs`` and make the root a ref.
        self_name = ref.split("/")[-1]
        body: Any = defs.get(self_name, {})
    else:
        self_name = schema.get("title") or model.__name__
        body = schema

    resolved = _resolve(body, defs, names, self_name, self_identifier, [self_name])
    _strip_annotations(resolved)

    name = self_identifier or model.__name__
    return json_schema_to_ts(resolved, name)


def pydantic_to_rules(model: SchemaModel) -> List[data_type_pb2.DefinitionDataTypeRule]:
    schema = model.model_json_schema()
    rules: List[data_type_pb2.DefinitionDataTypeRule] = []

    pattern = schema.get("pattern")
    if pattern:
        rules.append(
            data_type_pb2.DefinitionDataTypeRule(
                regex=data_type_pb2.DataTypeRegexRuleConfig(pattern=pattern)
            )
        )

    minimum = schema.get("minimum")
    maximum = schema.get("maximum")
    if minimum is not None and maximum is not None:
        rules.append(
            data_type_pb2.DefinitionDataTypeRule(
                number_range=data_type_pb2.DataTypeNumberRangeRuleConfig(
                    **{"from": int(minimum), "to": int(maximum)}
                )
            )
        )
    return rules
