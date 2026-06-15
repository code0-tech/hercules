import type {ModuleConfigurations} from "@code0-tech/tucana/shared";
import {CodeZeroEvent} from "../events.ts";
import type {CodeZeroAction} from "../CodeZeroAction.ts";

export const packetType = "moduleConfigurations";

export function handle(action: CodeZeroAction, data: ModuleConfigurations): void {
    action.configs.update(data.moduleConfigurations);
    action.emit(CodeZeroEvent.moduleUpdated, data);
}
