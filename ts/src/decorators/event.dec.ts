import {EventSettingProps} from "../models/event.model";

export const EventSetting = (setting: EventSettingProps): ClassDecorator =>
    (target) => {
        const settings = Reflect.getMetadata('hercules:flow_settings', target) || [];
        settings.unshift(setting);
        Reflect.defineMetadata('hercules:flow_settings', settings, target);
    }
