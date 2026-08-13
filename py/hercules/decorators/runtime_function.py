"""Runtime function decorators.

Port of ``src/decorators/runtime_function.dec.ts``.
"""
from __future__ import annotations

from hercules._metadata import define_metadata


def OmitRuntimeFunction():
    def decorator(target):
        define_metadata("hercules:omit_function_definition", True, target)
        return target

    return decorator


__all__ = ["OmitRuntimeFunction"]
