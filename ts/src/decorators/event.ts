import {HerculesEventSetting} from "../models/event.ts";

export const EventSetting = (setting: HerculesEventSetting): ClassDecorator =>
    (target) => {
        const settings = Reflect.getMetadata('hercules:flow_settings', target) || [];
        settings.push(setting);
        Reflect.defineMetadata('hercules:flow_settings', settings, target);
    }
