import {BaseManager} from "./BaseManager.ts";
import type {HerculesFunctionDefinition} from "../models/function.ts";

export class FunctionManager extends BaseManager<string, HerculesFunctionDefinition> {}
