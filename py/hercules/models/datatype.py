"""Data type models (port of ``src/models/datatype.model.ts``)."""
from __future__ import annotations

from typing import List, Optional

from hercules.schema import Schema
from hercules.internal.schema import pydantic_to_rules, pydantic_to_type_string
from hercules.types import Translation


class DataTypeProps:
    """A resolved data type definition.

    ``type`` is computed lazily from the schema so that errors (e.g. a recursive
    schema that cannot be inlined) surface only when the type string is read.
    """

    def __init__(
        self,
        identifier: str,
        schema: Schema,
        name: Optional[List[Translation]] = None,
        display_message: Optional[List[Translation]] = None,
        alias: Optional[List[Translation]] = None,
        generic_keys: Optional[List[str]] = None,
        type_string: Optional[str] = None,
    ) -> None:
        self.identifier = identifier
        self.schema = schema
        self.name = name or []
        self.display_message = display_message or []
        self.alias = alias or []
        self.generic_keys = generic_keys or []
        # ``type_string`` is an explicit TypeScript type to emit verbatim. The
        # generated built-in definitions use it to keep cross-data-type identifier
        # references byte-exact; user-authored data types leave it unset and the
        # type is derived from the Pydantic schema instead.
        self._type_string = type_string
        self.rules = pydantic_to_rules(schema)

    @property
    def type(self) -> str:
        if self._type_string is not None:
            return self._type_string
        return pydantic_to_type_string(self.schema)


class DataTypeRunnable:
    """Base class for data type definitions."""
