import {BaseManager} from "./BaseManager";
import type {SubFlowFunctionDefinition} from "../types";

/**
 * Sub flow functions a runtime function returned at execution time, keyed by the
 * identifier reported to Aquila. Unlike the other managers this one is not filled by
 * registering classes up front: entries appear while the action runs (see
 * {@link Action.registerSubFlowFunction}).
 */
export class SubFlowFunctionManager extends BaseManager<string, SubFlowFunctionDefinition> {}
