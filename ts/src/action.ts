import {EventEmitter} from "node:events";
import type {GrpcOptions, GrpcTransport} from "@protobuf-ts/grpc-transport";
import {ActionTransferRequest, type ActionTransferResponse} from "@code0-tech/tucana/aquila";
import {constructValue, type PlainValue} from "@code0-tech/tucana/helpers";
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
import {FunctionManager} from "./manager/FunctionManager";
import {RuntimeFunctionManager} from "./manager/RuntimeFunctionManager";
import {DataTypeManager} from "./manager/DataTypeManager";
import {EventManager} from "./manager/EventManager";
import {RuntimeEventManager} from "./manager/RuntimeEventManager";
import {actions} from "./actions";

export class Action extends EventEmitter<CodeZeroEventMap> {
    private _transport?: GrpcTransport;
    private _stream?: DuplexStreamingCall<ActionTransferRequest, ActionTransferResponse>;
    private readonly _actions = new Map(actions.map(a => [a.packetType, a.handle]));

    readonly configs = new ConfigManager();
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
        const def = runtimeEventMap(klass);
        this.runtimeEvents.set(def.identifier, def);
    }

    async fire(eventClass: EventClass | RuntimeEventClass, projectId: number | bigint, payload: PlainValue) {
        if (!this._stream) throw new Error("Not connected. Call connect() first.");
        const eventType: string = Reflect.getMetadata('hercules:identifier', eventClass);
        if (!eventType) throw new Error(`${eventClass.name} is missing an @Identifier decorator.`);
        const request = ActionTransferRequest.create({
            data: {
                oneofKind: "event",
                event: {
                    projectId: typeof projectId === "bigint" ? projectId : BigInt(projectId),
                    eventType,
                    payload: constructValue(payload ?? null),
                },
            },
        });
        await this._stream.requests.send(request);
        this.emit(eventType as Extract<keyof CodeZeroEventMap, string>, projectId, payload);
        this.emit(CodeZeroEvent.streamMessageSent, request);
    }

    async connect(authToken: string, aquilaUrl?: string, grpcOptions?: GrpcOptions) {
        const url = aquilaUrl ?? this._aquilaUrl;
        if (!url) throw new Error("aquilaUrl must be provided in the constructor or connect()");

        try {
            const {transport, stream} = await createConnection(this._buildModule(), authToken, url, grpcOptions);
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

    private _buildModule() {
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
