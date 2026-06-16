import type {ModuleConfigurations} from "@code0-tech/tucana/shared";
import {CodeZeroEvent} from "../events";
import type {Action} from "../action";

export const packetType = "moduleConfigurations";

export function handle(action: Action, data: ModuleConfigurations): void {
    action.configs.update(data.moduleConfigurations);
    action.emit(CodeZeroEvent.moduleUpdated, data);
}
