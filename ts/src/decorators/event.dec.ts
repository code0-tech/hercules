import {EventSettingProps} from "../models/event.model";

export const EventSetting = (setting: EventSettingProps): ClassDecorator =>
    (target) => {
        // getOwnMetadata: getMetadata would return the parent class's array on subclasses,
        // and unshift would mutate the parent's settings.
        const settings = Reflect.getOwnMetadata('hercules:flow_settings', target) || [];
        settings.unshift(setting);
        Reflect.defineMetadata('hercules:flow_settings', settings, target);
    }
