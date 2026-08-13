"""Runtime event mapping (port of ``src/map/runtime_event.map.ts``)."""
from __future__ import annotations

from hercules._metadata import get_metadata
from hercules.models.runtime_event import RuntimeEventProps


def runtime_event_map(klass: type) -> RuntimeEventProps:
    identifier = get_metadata("hercules:identifier", klass)
    signature = get_metadata("hercules:signature", klass)
    settings = get_metadata("hercules:flow_settings", klass) or []
    name = get_metadata("hercules:name", klass) or []
    description = get_metadata("hercules:description", klass) or []
    documentation = get_metadata("hercules:documentation", klass) or []
    display_message = get_metadata("hercules:display_message", klass) or []
    alias = get_metadata("hercules:alias", klass) or []
    display_icon = get_metadata("hercules:display_icon", klass)
    editable = get_metadata("hercules:editable", klass)
    editable = editable if editable is not None else False

    if not identifier:
        raise ValueError(
            f"Runtime event class {klass.__name__} is missing an identifier. "
            f'Add @Identifier("your_identifier") to the class.'
        )
    if not signature:
        raise ValueError(
            f"Runtime event class {klass.__name__} is missing a signature. "
            f'Add @Signature("(): RETURN_TYPE") to the class.'
        )

    return RuntimeEventProps(
        identifier=identifier,
        signature=signature,
        settings=settings,
        name=name,
        description=description,
        documentation=documentation,
        display_message=display_message,
        alias=alias,
        display_icon=display_icon,
        editable=editable,
    )
