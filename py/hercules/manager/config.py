"""Config manager (port of ``src/manager/config-manager.ts``)."""
from __future__ import annotations

from typing import List

from hercules._tucana.helpers import construct_value, to_allowed_value
from hercules.manager.base import BaseManager
from hercules.types import ProjectConfiguration


class ConfigManager(BaseManager):
    def update(self, configs: List) -> None:
        self.clear()
        for config in configs:
            module_configurations = list(config.module_configurations)

            def make_find_config(mcs):
                def find_config(identifier):
                    mc = next(
                        (c for c in mcs if c.identifier == identifier), None
                    )
                    if mc is None:
                        return None
                    return to_allowed_value(
                        mc.value if mc.HasField("value") else construct_value(None)
                    )

                return find_config

            self.set(
                config.project_id,
                ProjectConfiguration(
                    project_id=config.project_id,
                    config_values=[
                        {
                            "identifier": mc.identifier,
                            "value": to_allowed_value(
                                mc.value if mc.HasField("value") else construct_value(None)
                            ),
                        }
                        for mc in module_configurations
                    ],
                    find_config=make_find_config(module_configurations),
                ),
            )
