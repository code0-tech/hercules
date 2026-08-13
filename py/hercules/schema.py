"""Data-type schema surface, built on Pydantic v2.

Data types are described with plain Pydantic models. Object shapes are ordinary
``BaseModel`` subclasses; scalar/primitive shapes (a bare ``number``, a
constrained ``string``, ``Record<string, unknown>``, ...) use ``RootModel``. The
model is turned into a TypeScript type string and validation rules by
:mod:`hercules.internal.schema`.

Example::

    from hercules.schema import BaseModel, RootModel, Annotated, StringConstraints

    class Email(RootModel[Annotated[str, StringConstraints(pattern=r"^[^@]+@[^@]+$")]]):
        pass

    class User(BaseModel):
        name: str
        email: Email
"""
from __future__ import annotations

from typing import Type

from typing_extensions import Annotated
from pydantic import BaseModel, RootModel, Field, StringConstraints, ConfigDict

# A data-type schema is any Pydantic model class (``RootModel`` is a ``BaseModel``).
Schema = Type[BaseModel]

__all__ = [
    "Schema",
    "BaseModel",
    "RootModel",
    "Field",
    "StringConstraints",
    "ConfigDict",
    "Annotated",
]
