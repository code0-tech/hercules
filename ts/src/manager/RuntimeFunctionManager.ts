import {BaseManager} from "./BaseManager.ts";
import type {HerculesRuntimeFunctionDefinition} from "../models/runtime-function.ts";

export class RuntimeFunctionManager extends BaseManager<string, HerculesRuntimeFunctionDefinition> {}
