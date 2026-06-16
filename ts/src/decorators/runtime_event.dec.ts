import {RuntimeEventSettingProps} from "../models/runtime_event.model";

export const RuntimeEventSetting = (setting: RuntimeEventSettingProps): ClassDecorator =>
    (target) => {
        const settings = Reflect.getMetadata('hercules:runtime_flow_settings', target) || [];
        settings.push(setting);
        Reflect.defineMetadata('hercules:runtime_flow_settings', settings, target);
    }
