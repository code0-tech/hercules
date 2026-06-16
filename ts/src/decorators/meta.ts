import {Translation} from "../types";

export const Identifier = (id: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:identifier', id, target)

export const Name = (...translation: Translation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:name', translation, target)

export const Description = (...translation: Translation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:description', translation, target)

export const Documentation = (...translation: Translation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:documentation', translation, target)

export const DisplayMessage = (...translation: Translation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:display_message', translation, target)

export const Alias = (...translation: Translation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:alias', translation, target)

export const DeprecationMessage = (...translation: Translation[]): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:deprecation_message', translation, target)

export const Signature = (signature: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:signature', signature, target)

export const DisplayIcon = (displayIcon: string): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:display_icon', displayIcon, target)

export const Editable = (editable: boolean = true): ClassDecorator =>
    (target) => Reflect.defineMetadata('hercules:editable', editable, target)
