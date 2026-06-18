import type {Translation} from "../types";
import type {RuntimeEventProps, RuntimeEventClass} from "../models/runtime_event.model";
import type {EventSettingProps} from "../models/event.model";

export const runtimeEventMap = (klass: RuntimeEventClass): RuntimeEventProps => {
    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const signature: string = Reflect.getMetadata('hercules:signature', klass);
    const settings: EventSettingProps[] = Reflect.getMetadata('hercules:flow_settings', klass) || [];
    const name: Translation[] = Reflect.getMetadata('hercules:name', klass) || [];
    const description: Translation[] = Reflect.getMetadata('hercules:description', klass) || [];
    const documentation: Translation[] = Reflect.getMetadata('hercules:documentation', klass) || [];
    const displayMessage: Translation[] = Reflect.getMetadata('hercules:display_message', klass) || [];
    const alias: Translation[] = Reflect.getMetadata('hercules:alias', klass) || [];
    const displayIcon: string | undefined = Reflect.getMetadata('hercules:display_icon', klass);
    const editable: boolean = Reflect.getMetadata('hercules:editable', klass) ?? false;

    if (!identifier) throw new Error(`Runtime event class ${klass.name} is missing an identifier. Add @Identifier("your_identifier") to the class.`);
    if (!signature) throw new Error(`Runtime event class ${klass.name} is missing a signature. Add @Signature("(): RETURN_TYPE") to the class.`);

    return {identifier, signature, settings, name, description, documentation, displayMessage, alias, displayIcon, editable};
};
