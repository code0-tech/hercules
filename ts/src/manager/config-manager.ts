import {constructValue, toAllowedValue} from "@code0-tech/tucana/helpers";
import type {ModuleProjectConfigurations} from "@code0-tech/tucana/shared";
import type {HerculesActionProjectConfiguration} from "../types";
import {BaseManager} from "./BaseManager";

export class ConfigManager extends BaseManager<bigint, HerculesActionProjectConfiguration> {
    update(configs: ModuleProjectConfigurations[]): void {
        this.clear();
        for (const config of configs) {
            this.set(config.projectId, {
                projectId: config.projectId,
                configValues: config.moduleConfigurations.map(mc => ({
                    identifier: mc.identifier,
                    value: toAllowedValue(mc.value || constructValue(null)),
                })),
                findConfig: identifier => {
                    const mc = config.moduleConfigurations.find(c => c.identifier === identifier);
                    return mc ? toAllowedValue(mc.value || constructValue(null)) : undefined;
                },
            });
        }
    }
}
