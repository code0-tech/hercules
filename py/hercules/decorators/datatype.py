"""Data type decorators (port of ``src/decorators/datatype.dec.ts``)."""
from __future__ import annotations

from typing import Type

from pydantic import BaseModel

from hercules._metadata import define_metadata


def Schema_(schema: Type[BaseModel]):
    """Attach the Pydantic model that describes a data type's shape."""

    def decorator(target):
        define_metadata("hercules:schema", schema, target)
        return target

    return decorator


def TypeString(type_string: str):
    """Emit an explicit TypeScript type string for a data type, verbatim.

    Used by the generated built-in definitions to preserve cross-data-type
    identifier references exactly. User-authored data types normally omit this
    and let the type be derived from the ``@Schema`` Pydantic model.
    """

    def decorator(target):
        define_metadata("hercules:type_string", type_string, target)
        return target

    return decorator


# Exported under the name ``Schema`` to match the TypeScript decorator.
Schema = Schema_  # type: ignore[assignment]

__all__ = ["Schema", "TypeString"]
