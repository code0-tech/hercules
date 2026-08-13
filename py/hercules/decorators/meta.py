"""Meta decorators (port of ``src/decorators/meta.dec.ts``).

Each decorator attaches class metadata under a ``hercules:*`` key, mirroring the
TypeScript ``reflect-metadata`` usage. Translation arguments accept either
:class:`~hercules.types.Translation` instances or ``{"code", "content"}`` dicts.
"""
from __future__ import annotations

from typing import List, Union

from hercules._metadata import define_metadata
from hercules.types import Translation

TranslationLike = Union[Translation, dict]


def normalize_translations(items) -> List[Translation]:
    result: List[Translation] = []
    for item in items:
        if isinstance(item, Translation):
            result.append(item)
        elif isinstance(item, dict):
            result.append(Translation(code=item["code"], content=item["content"]))
        else:
            raise TypeError(f"Invalid translation: {item!r}")
    return result


def _meta(key: str):
    def decorator_factory(*translations: TranslationLike):
        normalized = normalize_translations(translations)

        def decorator(target):
            define_metadata(key, normalized, target)
            return target

        return decorator

    return decorator_factory


Identifier = lambda id: _define_simple("hercules:identifier", id)  # noqa: E731
Signature = lambda signature: _define_simple("hercules:signature", signature)  # noqa: E731
DisplayIcon = lambda display_icon: _define_simple("hercules:display_icon", display_icon)  # noqa: E731


def _define_simple(key: str, value):
    def decorator(target):
        define_metadata(key, value, target)
        return target

    return decorator


def Editable(editable: bool = True):
    def decorator(target):
        define_metadata("hercules:editable", editable, target)
        return target

    return decorator


Name = _meta("hercules:name")
Description = _meta("hercules:description")
Documentation = _meta("hercules:documentation")
DisplayMessage = _meta("hercules:display_message")
Alias = _meta("hercules:alias")
DeprecationMessage = _meta("hercules:deprecation_message")

__all__ = [
    "Identifier",
    "Name",
    "Description",
    "Documentation",
    "DisplayMessage",
    "Alias",
    "DeprecationMessage",
    "Signature",
    "DisplayIcon",
    "Editable",
    "normalize_translations",
]
