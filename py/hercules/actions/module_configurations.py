"""Module configurations handler.

Port of ``src/actions/ModuleConfigurations.ts``.
"""
from __future__ import annotations

from hercules.events import CodeZeroEvent

packet_type = "module_configurations"


def handle(action, data) -> None:
    action.configs.update(data.module_configurations)
    action.emit(CodeZeroEvent.module_updated, data)
