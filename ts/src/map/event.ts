import type {HerculesTranslation} from "../types.ts";
import type {EventClass, HerculesEvent, HerculesEventSetting} from "../models/event.ts";
import type {RuntimeEventClass} from "../models/runtime-event.ts";
import {runtimeEventMap} from "./runtime-event.ts";

export const eventMap = <T extends RuntimeEventClass>(klass: EventClass<T>): HerculesEvent => {
    const parentClass = Object.getPrototypeOf(klass);
    const runtimeEvent = runtimeEventMap(parentClass);

    const identifier: string = Reflect.getMetadata('hercules:identifier', klass);
    const signature: string = Reflect.getMetadata('hercules:signature', klass);
    const settings: HerculesEventSetting[] = Reflect.getMetadata('hercules:flow_settings', klass) || [];
    const name: HerculesTranslation[] = Reflect.getMetadata('hercules:name', klass);
    const description: HerculesTranslation[] = Reflect.getMetadata('hercules:description', klass);
    const documentation: HerculesTranslation[] = Reflect.getMetadata('hercules:documentation', klass);
    const displayMessage: HerculesTranslation[] = Reflect.getMetadata('hercules:display_message', klass);
    const alias: HerculesTranslation[] = Reflect.getMetadata('hercules:alias', klass);
    const linkedDataTypes: string[] = Reflect.getMetadata('hercules:linked_data_type_identifiers', klass);
    const displayIcon: string | undefined = Reflect.getMetadata('hercules:display_icon', klass);
    const editable: boolean = Reflect.getMetadata('hercules:editable', klass) ?? false;

    if (!identifier) throw new Error(`Event class ${klass.name} is missing an identifier. Add @Identifier("your_identifier") to the class.`);

    return {
        runtimeIdentifier: runtimeEvent.identifier,
        identifier,
        signature: signature || runtimeEvent.signature,
        settings,
        name: name || runtimeEvent.name,
        description: description || runtimeEvent.description,
        documentation: documentation || runtimeEvent.documentation,
        displayMessage: displayMessage || runtimeEvent.displayMessage,
        alias: alias || runtimeEvent.alias,
        linkedDataTypes: linkedDataTypes || runtimeEvent.linkedDataTypes,
        displayIcon: displayIcon || runtimeEvent.displayIcon,
        editable,
    };
};
