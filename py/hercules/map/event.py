"""Event mapping (port of ``src/map/event.map.ts``)."""
from __future__ import annotations

from dataclasses import fields, replace
from typing import List

from hercules._metadata import get_metadata, get_own_metadata
from hercules.map.runtime_event import runtime_event_map
from hercules.models.event import EventModel, EventSettingProps


def _merge_setting(base: EventSettingProps, override: EventSettingProps) -> EventSettingProps:
    # Mirror `{...rs, ...override}`: only the properties the override actually set
    # (non-None) replace the runtime event's setting.
    changes = {
        f.name: getattr(override, f.name)
        for f in fields(override)
        if f.name != "identifier" and getattr(override, f.name) is not None
    }
    return replace(base, **changes)


def event_map(klass: type) -> EventModel:
    parent_class = klass.__bases__[0]
    runtime_event = runtime_event_map(parent_class)

    identifier = get_metadata("hercules:identifier", klass)
    signature = get_metadata("hercules:signature", klass)
    settings: List[EventSettingProps] = (
        get_own_metadata("hercules:flow_settings", klass) or []
    )
    name = get_metadata("hercules:name", klass)
    description = get_metadata("hercules:description", klass)
    documentation = get_metadata("hercules:documentation", klass)
    display_message = get_metadata("hercules:display_message", klass)
    alias = get_metadata("hercules:alias", klass)
    display_icon = get_metadata("hercules:display_icon", klass)
    editable = get_metadata("hercules:editable", klass)
    editable = editable if editable is not None else False

    if not identifier:
        raise ValueError(
            f"Event class {klass.__name__} is missing an identifier. "
            f'Add @Identifier("your_identifier") to the class.'
        )

    runtime_settings = runtime_event.settings or []
    for es in settings:
        if not any(s.identifier == es.identifier for s in runtime_settings):
            raise ValueError(
                f'Event class {klass.__name__} has a setting "{es.identifier}" '
                f"that does not exist in its runtime event."
            )

    # Settings come from the runtime event (in its order); the event class only
    # overrides individual properties per identifier.
    merged_settings: List[EventSettingProps] = []
    for rs in runtime_settings:
        override = next((s for s in settings if s.identifier == rs.identifier), None)
        merged_settings.append(_merge_setting(rs, override) if override else replace(rs))

    return EventModel(
        runtime_identifier=runtime_event.identifier,
        identifier=identifier,
        signature=signature or runtime_event.signature,
        settings=merged_settings,
        name=name or runtime_event.name,
        description=description or runtime_event.description,
        documentation=documentation or runtime_event.documentation,
        display_message=display_message or runtime_event.display_message,
        alias=alias or runtime_event.alias,
        display_icon=display_icon or runtime_event.display_icon,
        editable=editable,
    )
