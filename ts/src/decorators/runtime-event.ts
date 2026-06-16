import {HerculesRuntimeEventSetting} from "../models/runtime-event";

export const RuntimeEventSetting = (setting: HerculesRuntimeEventSetting): ClassDecorator =>
    (target) => {
        const settings = Reflect.getMetadata('hercules:runtime_flow_settings', target) || [];
        settings.push(setting);
        Reflect.defineMetadata('hercules:runtime_flow_settings', settings, target);
    }
