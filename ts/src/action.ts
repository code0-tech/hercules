import {EventEmitter} from "node:events";
import {randomUUID} from "node:crypto";
import type {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ActionTransferRequest, type ActionNodeSubFlowValue, type ActionTransferResponse} from "@code0-tech/tucana/aquila";
import {constructValue, toAllowedValue, type PlainValue} from "@code0-tech/tucana/helpers";
import type {Value, Error as ProtoError} from "@code0-tech/tucana/shared";
import {RuntimeError} from "./types";
import type {DuplexStreamingCall} from "@protobuf-ts/runtime-rpc";
import type {FunctionClass} from "./models/function.model";
import type {RuntimeFunctionClass} from "./models/runtime_function.model";
import {runtimeFunctionMap} from "./map/runtime_function.map";
import {functionMap} from "./map/function.map";
import type {DataTypeClass} from "./models/datatype.model";
import {dataTypeMap} from "./map/datatype.map";
import type {EventClass} from "./models/event.model";
import {eventMap} from "./map/event.map";
import type {RuntimeEventClass} from "./models/runtime_event.model";
import {runtimeEventMap} from "./map/runtime_event.map";
import type {ConfigurationDefinition, Translation} from "./types";
import {CodeZeroEvent, type CodeZeroEventMap} from "./events";
import {createConnection} from "./internal/connection";
import {buildModule} from "./internal/module-builder";
import {ConfigManager} from "./manager/config-manager";
import {FlowManager} from "./manager/FlowManager";
import {FunctionManager} from "./manager/FunctionManager";
import {RuntimeFunctionManager} from "./manager/RuntimeFunctionManager";
import {DataTypeManager} from "./manager/DataTypeManager";
import {EventManager} from "./manager/EventManager";
import {RuntimeEventManager} from "./manager/RuntimeEventManager";
import {actions} from "./actions";

// Global registry keyed via Symbol.for so the CLI finds actions even when the
// user's code loaded a different copy of this module (e.g. the CJS build).
const ACTION_REGISTRY = Symbol.for("hercules.actions");

export function isExportMode(): boolean {
    return process.env.HERCULES_EXPORT === "1";
}

export function registeredActions(): readonly Action[] {
    return (globalThis as Record<symbol, unknown>)[ACTION_REGISTRY] as Action[] ?? [];
}

export class Action extends EventEmitter<CodeZeroEventMap> {
    private _transport?: GrpcTransport;
    private _stream?: DuplexStreamingCall<ActionTransferRequest, ActionTransferResponse>;
    private readonly _actions = new Map(actions.map(a => [a.packetType, a.handle]));
    // Pending sub flow / flow execution requests awaiting a response, keyed by a
    // per-invocation identifier: sub flow executions use the correlation
    // identifier generated for each invocation (echoed back on the response),
    // flow executions use their execution identifier. Both are unique per call,
    // so each key maps to a single pending request.
    private readonly _pendingExecutions = new Map<string, {
        resolve: (value: PlainValue) => void;
        reject: (error: unknown) => void;
    }>();

    readonly configs = new ConfigManager();
    readonly flows = new FlowManager();
    readonly functions = new FunctionManager();
    readonly runtimeFunctions = new RuntimeFunctionManager();
    readonly dataTypes = new DataTypeManager();
    readonly events = new EventManager();
    readonly runtimeEvents = new RuntimeEventManager();

    constructor(
        private readonly _identifier: string,
        private readonly _version: string,
        private readonly _aquilaUrl: string | undefined,
        private readonly _author: string,
        private readonly _icon: string,
        private readonly _documentation: string,
        private readonly _name: Translation[],
        private readonly _configurationDefinitions: ConfigurationDefinition[] = [],
    ) {
        super();
        if (isExportMode()) {
            const registry = (globalThis as Record<symbol, unknown>)[ACTION_REGISTRY] as Action[] | undefined;
            if (registry) registry.push(this);
            else (globalThis as Record<symbol, unknown>)[ACTION_REGISTRY] = [this];
        }
    }

    get identifier() { return this._identifier; }
    get version() { return this._version; }
    get stream() { return this._stream; }

    registerFunction<T extends RuntimeFunctionClass>(klass: FunctionClass<T>) {
        const def = functionMap(klass);
        this.functions.set(def.runtimeName, def);
    }

    registerRuntimeFunction(klass: RuntimeFunctionClass) {
        const omitDefinition = Reflect.getMetadata('hercules:omit_function_definition', klass) || false;
        const def = runtimeFunctionMap(klass);
        this.runtimeFunctions.set(def.runtimeName, def);
        if (!omitDefinition) {
            this.functions.set(def.runtimeName, {
                ...def,
                runtimeDefinitionName: def.runtimeName,
                parameters: def.parameters?.map(p => ({...p, runtimeDefinitionName: p.runtimeName})) || [],
            });
        }
    }

    registerDataTypeClass(klass: DataTypeClass) {
        const def = dataTypeMap(klass);
        this.dataTypes.set(def.identifier, def);
    }

    registerEventClass(klass: EventClass) {
        const def = eventMap(klass);
        this.events.set(def.identifier, def);
    }

    registerRuntimeEventClass(klass: RuntimeEventClass) {
        const omitDefinition = Reflect.getMetadata('hercules:omit_event_definition', klass) || false;
        const def = runtimeEventMap(klass);
        this.runtimeEvents.set(def.identifier, def);
        if (!omitDefinition) {
            this.events.set(def.identifier, {
                ...def,
                runtimeIdentifier: def.identifier,
            });
        }
    }

    /**
     * Fire the flow(s) bound to an event, or a single flow by id.
     *
     * Given an event class, every registered flow whose {@link ActionFlow.type}
     * matches the event's identifier is executed; the results are resolved
     * together as an array. Given a flow id, only that flow is executed and its
     * result is returned.
     *
     * Flows are tracked from the ActionFlowUpdate messages Aquila streams (see
     * {@link Action.flows}). Each flow is executed via {@link Action.executeFlow}.
     */
    fire(eventClass: EventClass | RuntimeEventClass, payload?: PlainValue): Promise<PlainValue[]>;
    fire(flowId: bigint | number, payload?: PlainValue): Promise<PlainValue>;
    async fire(
        target: EventClass | RuntimeEventClass | bigint | number,
        payload?: PlainValue,
    ): Promise<PlainValue | PlainValue[]> {
        if (!this._stream) throw new Error("Not connected. Call connect() first.");

        // Single flow by id.
        if (typeof target === "bigint" || typeof target === "number") {
            return this.executeFlow(target, payload);
        }

        // All flows bound to the event's flow type.
        const flowType = Reflect.getMetadata("hercules:identifier", target) as string | undefined;
        if (!flowType) throw new Error(`${target.name} is missing an @Identifier decorator.`);
        const flows = this.flows.filter(flow => flow.type === flowType);
        return Promise.all(flows.map(flow => this.executeFlow(flow.flowId, payload ?? null)));
    }

    /**
     * Execute the sub flow referenced by a {@link ActionNodeSubFlowValue} parameter
     * with the given parameters and resolve with its result. May be called
     * repeatedly for the same sub flow (e.g. once per iteration).
     */
    async executeSubFlow(subFlow: ActionNodeSubFlowValue, ...params: PlainValue[]): Promise<PlainValue> {
        if (!this._stream) throw new Error("Not connected. Call connect() first.");
        const {executionIdentifier} = subFlow;
        // Scope this individual invocation with a fresh correlation identifier so
        // its response can be matched even when the same sub flow is executed
        // repeatedly and responses arrive out of order.
        const correlationIdentifier = randomUUID();
        const result = this._awaitExecutionResponse(correlationIdentifier);
        const request = ActionTransferRequest.create({
            data: {
                oneofKind: "subFlowExecution",
                subFlowExecution: {
                    executionIdentifier,
                    parameters: params.map(p => constructValue(p ?? null)),
                    correlationIdentifier,
                },
            },
        });
        await this._stream.requests.send(request);
        this.emit(CodeZeroEvent.streamMessageSent, request);
        return result;
    }

    /**
     * Execute one of the action's own flows by id and resolve with its result.
     */
    async executeFlow(flowId: string | bigint | number, payload?: PlainValue): Promise<PlainValue> {
        if (!this._stream) throw new Error("Not connected. Call connect() first.");
        const executionIdentifier = randomUUID();
        const result = this._awaitExecutionResponse(executionIdentifier);
        const request = ActionTransferRequest.create({
            data: {
                oneofKind: "flowExecution",
                flowExecution: {
                    executionIdentifier,
                    flowId: String(flowId),
                    payload: constructValue(payload ?? null),
                },
            },
        });
        await this._stream.requests.send(request);
        this.emit(CodeZeroEvent.streamMessageSent, request);
        return result;
    }

    private _awaitExecutionResponse(identifier: string): Promise<PlainValue> {
        return new Promise<PlainValue>((resolve, reject) => {
            this._pendingExecutions.set(identifier, {resolve, reject});
        });
    }

    /**
     * Resolve or reject a pending sub flow / flow execution request. Invoked by
     * the response handlers when Aquila reports an execution's outcome. The
     * identifier is a sub flow's correlation identifier or a flow execution's
     * execution identifier.
     */
    resolveExecutionResponse(
        identifier: string,
        result:
            | {oneofKind: "success"; success: Value}
            | {oneofKind: "failure"; failure: ProtoError}
            | {oneofKind: undefined},
    ): void {
        const pending = this._pendingExecutions.get(identifier);
        this._pendingExecutions.delete(identifier);
        if (!pending) {
            this.emit(CodeZeroEvent.error, new Error(
                `Received execution response for unknown execution identifier: ${identifier}`,
            ));
            return;
        }
        if (result.oneofKind === "success") {
            pending.resolve(toAllowedValue(result.success));
        } else if (result.oneofKind === "failure") {
            pending.reject(new RuntimeError(result.failure.code, result.failure.message));
        } else {
            pending.reject(new Error("Received execution response with no result"));
        }
    }

    async connect(authToken: string, aquilaUrl?: string, grpcOptions?: GrpcOptions) {
        if (isExportMode()) return;
        const url = aquilaUrl ?? this._aquilaUrl;
        if (!url) throw new Error("aquilaUrl must be provided in the constructor or connect()");

        try {
            const {transport, stream} = await createConnection(this.buildModule(), authToken, url, grpcOptions);
            this._transport = transport;
            this._stream = stream;
        } catch (err) {
            this.emit(CodeZeroEvent.error, err as Error);
            throw err;
        }

        this.emit(CodeZeroEvent.connected, this);
        await this._processStream();
    }

    private async _processStream() {
        for await (const message of this._stream!.responses) {
            this.emit(CodeZeroEvent.streamMessageReceived, message);
            const {data} = message;
            if (data.oneofKind === undefined) {
                this.emit(CodeZeroEvent.error, new Error("Received unknown message type from stream"));
                continue;
            }
            this._actions.get(data.oneofKind)?.(this, (data as Record<string, unknown>)[data.oneofKind]);
        }
    }

    buildModule() {
        return buildModule({
            identifier: this._identifier, version: this._version,
            author: this._author, icon: this._icon, documentation: this._documentation,
            name: this._name, configurationDefinitions: this._configurationDefinitions,
            dataTypes: this.dataTypes.values(),
            events: this.events.values(),
            runtimeEvents: this.runtimeEvents.values(),
            functions: this.functions.values(),
            runtimeFunctions: this.runtimeFunctions.values(),
        });
    }
}
