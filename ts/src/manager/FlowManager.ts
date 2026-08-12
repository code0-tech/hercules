import type {ActionFlow} from "@code0-tech/tucana/aquila";
import {BaseManager} from "./BaseManager";

/**
 * Registry of the action's own flows, kept in sync via ActionFlowUpdate messages.
 * Keyed by flow id. Use {@link Action.executeFlow} to run one of these flows.
 */
export class FlowManager extends BaseManager<bigint, ActionFlow> {}
