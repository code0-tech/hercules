import {BaseManager} from "./BaseManager";
import type {SubFlowFunctionDefinition} from "../types";

/** How long a returned sub flow function stays in memory and invocable: 30 minutes. */
export const SUB_FLOW_FUNCTION_TTL_MS = 30 * 60 * 1000;

/**
 * Sub flow functions a runtime function returned at execution time, keyed by the
 * identifier reported to Aquila. Unlike the other managers this one is not filled by
 * registering classes up front: entries appear while the action runs (see
 * {@link Action.registerSubFlowFunction}).
 *
 * Each entry has a maximum lifetime of {@link SUB_FLOW_FUNCTION_TTL_MS}, counted from
 * when it was registered and never extended by an invocation, so a flow that holds a
 * function forever cannot grow the registry without bound. Expired entries are
 * dropped by a sweep scheduled for the next expiry, and on any read or write, so an
 * expired function is never invoked even if the sweep could not run.
 */
export class SubFlowFunctionManager extends BaseManager<string, SubFlowFunctionDefinition> {
    /** Expiry timestamp per key. Insertion order is expiry order, since the TTL is fixed. */
    private readonly _expiries = new Map<string, number>();
    private _sweepTimer?: ReturnType<typeof setTimeout>;

    constructor(private readonly _ttlMs: number = SUB_FLOW_FUNCTION_TTL_MS) {
        super();
    }

    set(key: string, value: SubFlowFunctionDefinition): this {
        // Re-insert the expiry so a replaced key moves to the back and the map stays
        // ordered by expiry.
        this._expiries.delete(key);
        super.set(key, value);
        this._expiries.set(key, Date.now() + this._ttlMs);
        this.prune();
        return this;
    }

    get(key: string): SubFlowFunctionDefinition | undefined {
        this.prune();
        return super.get(key);
    }

    has(key: string): boolean {
        this.prune();
        return super.has(key);
    }

    delete(key: string): boolean {
        this._expiries.delete(key);
        const deleted = super.delete(key);
        this._scheduleSweep(Date.now());
        return deleted;
    }

    clear(): void {
        this._expiries.clear();
        super.clear();
        this._scheduleSweep(Date.now());
    }

    /** Drop every entry whose lifetime has passed, then schedule the next sweep. */
    prune(now: number = Date.now()): void {
        for (const [key, expiresAt] of this._expiries) {
            // Ordered by expiry, so the first entry still alive ends the sweep.
            if (expiresAt > now) break;
            this._expiries.delete(key);
            super.delete(key);
        }
        this._scheduleSweep(now);
    }

    private _scheduleSweep(now: number): void {
        if (this._sweepTimer !== undefined) {
            clearTimeout(this._sweepTimer);
            this._sweepTimer = undefined;
        }
        const next = this._expiries.values().next();
        if (next.done) return;
        this._sweepTimer = setTimeout(() => {
            this._sweepTimer = undefined;
            this.prune();
        }, Math.max(0, next.value - now));
        // Expiring entries must not keep the process alive on its own.
        (this._sweepTimer as {unref?: () => void}).unref?.();
    }
}
