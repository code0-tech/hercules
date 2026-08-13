"""Event decorators (port of ``src/decorators/event.dec.ts``)."""
from __future__ import annotations

from typing import Union

from hercules._metadata import define_metadata, get_own_metadata
from hercules.decorators.meta import normalize_translations
from hercules.models.event import EventSettingProps


def _coerce_setting(setting: Union[EventSettingProps, dict]) -> EventSettingProps:
    if isinstance(setting, EventSettingProps):
        return setting
    data = dict(setting)
    for key in ("name", "description"):
        if data.get(key) is not None:
            data[key] = normalize_translations(data[key])
    return EventSettingProps(**data)


def EventSetting(setting: Union[EventSettingProps, dict]):
    coerced = _coerce_setting(setting)

    def decorator(target):
        # get_own_metadata: getMetadata would return the parent class's array on
        # subclasses, and inserting would mutate the parent's settings.
        settings = get_own_metadata("hercules:flow_settings", target) or []
        settings.insert(0, coerced)
        define_metadata("hercules:flow_settings", settings, target)
        return target

    return decorator


__all__ = ["EventSetting"]
