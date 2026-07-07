import type {Translation} from "../types";
import type {EventClass, EventModel, EventSettingProps} from "../models/event.model";
import type {RuntimeEventClass} from "../models/runtime_event.model";
import {runtimeEventMap} from "./runtime_event.map";

export const eventMap = <T extends RuntimeEventClass>(klass: EventClass<T>): EventModel => {
    const parentClass = Object.getPrototypeOf(klass);
    const runtimeEvent = runtimeEventMap(parentClass);

    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const signature: string = Reflect.getMetadata('hercules:signature', klass);
    const settings: EventSettingProps[] = Reflect.getOwnMetadata('hercules:flow_settings', klass) || [];
    const name: Translation[] = Reflect.getMetadata('hercules:name', klass);
    const description: Translation[] = Reflect.getMetadata('hercules:description', klass);
    const documentation: Translation[] = Reflect.getMetadata('hercules:documentation', klass);
    const displayMessage: Translation[] = Reflect.getMetadata('hercules:display_message', klass);
    const alias: Translation[] = Reflect.getMetadata('hercules:alias', klass);
    const displayIcon: string | undefined = Reflect.getMetadata('hercules:display_icon', klass);
    const editable: boolean = Reflect.getMetadata('hercules:editable', klass) ?? false;

    if (!identifier) throw new Error(`Event class ${klass.name} is missing an identifier. Add @Identifier("your_identifier") to the class.`);

    for (const es of settings) {
        if (!runtimeEvent.settings?.find(s => s.identifier === es.identifier)) {
            throw new Error(`Event class ${klass.name} has a setting "${es.identifier}" that does not exist in its runtime event.`);
        }
    }

    // Settings come from the runtime event (in its order); the event class only overrides
    // individual properties (e.g. defaultValue, hidden) per identifier.
    const mergedSettings: EventSettingProps[] = (runtimeEvent.settings ?? []).map(rs => {
        const override = settings.find(s => s.identifier === rs.identifier);
        return override ? {...rs, ...override} : {...rs};
    });

    return {
        runtimeIdentifier: runtimeEvent.identifier,
        identifier,
        signature: signature || runtimeEvent.signature,
        settings: mergedSettings,
        name: name || runtimeEvent.name,
        description: description || runtimeEvent.description,
        documentation: documentation || runtimeEvent.documentation,
        displayMessage: displayMessage || runtimeEvent.displayMessage,
        alias: alias || runtimeEvent.alias,
        displayIcon: displayIcon || runtimeEvent.displayIcon,
        editable,
    };
};
