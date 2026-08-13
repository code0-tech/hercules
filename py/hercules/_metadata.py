"""Class metadata store — Python equivalent of ``reflect-metadata``.

Metadata is attached to classes under a private per-class dict. ``get_metadata``
walks the MRO (like ``Reflect.getMetadata`` walking the prototype chain), while
``get_own_metadata`` only inspects the class itself (like ``getOwnMetadata``).
"""
from __future__ import annotations

from typing import Any

_OWN = "__hercules_own_meta__"


def _own_dict(target: type) -> dict:
    # Only create/return the dict that belongs to ``target`` itself, never an
    # inherited one — mirrors ``Reflect.getOwnMetadata`` semantics.
    if _OWN not in target.__dict__:
        setattr(target, _OWN, {})
    return target.__dict__[_OWN]


def define_metadata(key: str, value: Any, target: type) -> None:
    _own_dict(target)[key] = value


def get_own_metadata(key: str, target: type, default: Any = None) -> Any:
    own = target.__dict__.get(_OWN)
    if own is None:
        return default
    return own.get(key, default)


def get_metadata(key: str, target: type, default: Any = None) -> Any:
    for klass in getattr(target, "__mro__", (target,)):
        own = klass.__dict__.get(_OWN)
        if own is not None and key in own:
            return own[key]
    return default
