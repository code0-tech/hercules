"""Runtime event decorators (port of ``src/decorators/runtime_event.dec.ts``)."""
from __future__ import annotations

from hercules._metadata import define_metadata


def OmitEvent():
    def decorator(target):
        define_metadata("hercules:omit_event_definition", True, target)
        return target

    return decorator


__all__ = ["OmitEvent"]
