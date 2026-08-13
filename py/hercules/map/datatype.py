"""Data type mapping (port of ``src/map/datatype.map.ts``)."""
from __future__ import annotations

from hercules._metadata import get_metadata
from hercules.internal.schema import register_schema
from hercules.models.datatype import DataTypeProps


def data_type_map(klass: type) -> DataTypeProps:
    identifier = get_metadata("hercules:identifier", klass)
    name = get_metadata("hercules:name", klass) or []
    display_message = get_metadata("hercules:display_message", klass) or []
    alias = get_metadata("hercules:alias", klass) or []
    generic_keys = get_metadata("hercules:generic_keys", klass) or []

    if not identifier:
        raise ValueError(
            f"Data type class {klass.__name__} is missing an identifier. "
            f'Add @Identifier("your_identifier") to the class.'
        )

    schema = get_metadata("hercules:schema", klass)
    if schema is None:
        raise ValueError(
            f"Data type class {klass.__name__} is missing a schema. "
            f"Add @Schema(MyModel) with a Pydantic model to the class."
        )

    register_schema(schema, identifier)

    type_string = get_metadata("hercules:type_string", klass)

    return DataTypeProps(
        identifier=identifier,
        schema=schema,
        name=name,
        display_message=display_message,
        alias=alias,
        generic_keys=generic_keys,
        type_string=type_string,
    )
