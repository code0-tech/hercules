import {beforeEach, describe, expect, it, vi} from "vitest";

// ---------------------------------------------------------------------------
// Hoisted mocks – vi.fn() MUST be called inside vi.hoisted() so that the
// resulting spy functions are regular (non-arrow) functions that can be used
// as constructors by createSdk.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
    return {
        mockTransferSend: vi.fn(),
        mockDataTypeUpdate: vi.fn(),
        mockRuntimeFunctionUpdate: vi.fn(),
        mockFlowTypeUpdate: vi.fn(),
        MockGrpcTransport: vi.fn(),
        MockActionTransferServiceClient: vi.fn(),
        MockDataTypeServiceClient: vi.fn(),
        MockRuntimeFunctionDefinitionServiceClient: vi.fn(),
        MockFlowTypeServiceClient: vi.fn(),
        streamState: {messages: [] as unknown[]},
    };
});

// ---------------------------------------------------------------------------
// Module mocks (only reference hoisted mocks here – no vi.fn() calls)
// ---------------------------------------------------------------------------
vi.mock("@grpc/grpc-js", () => ({
    ChannelCredentials: {createInsecure: () => ({})},
}));

vi.mock("@protobuf-ts/grpc-transport", () => ({
    GrpcTransport: mocks.MockGrpcTransport,
}));

// Protobuf message factories – return the init object unchanged so test
// assertions can inspect plain fields without real protobuf wrappers.
vi.mock("@code0-tech/tucana/pb/aquila.action_pb.js", () => ({
    TransferRequest: {create: (init: unknown) => init},
    TransferResponse: {},
    ExecutionRequest: {},
}));

vi.mock("@code0-tech/tucana/pb/aquila.data_type_pb.js", () => ({
    DataTypeUpdateRequest: {create: (init: unknown) => init},
}));

vi.mock("@code0-tech/tucana/pb/aquila.runtime_function_pb.js", () => ({
    RuntimeFunctionDefinitionUpdateRequest: {create: (init: unknown) => init},
}));

vi.mock("@code0-tech/tucana/pb/aquila.flow_type_pb.js", () => ({
    FlowTypeUpdateRequest: {create: (init: unknown) => init},
}));

vi.mock("@code0-tech/tucana/pb/shared.action_configuration_pb.js", () => ({
    ActionConfigurations: {},
}));

// FlowTypeSetting_UniquenessScope.NONE = 1  (mirrors the real generated enum)
vi.mock("@code0-tech/tucana/pb/shared.flow_definition_pb", () => ({
    FlowTypeSetting: {},
    FlowTypeSetting_UniquenessScope: {NONE: 1, UNKNOWN: 0},
}));

vi.mock("@code0-tech/tucana/pb/aquila.action_pb.client.js", () => ({
    ActionTransferServiceClient: mocks.MockActionTransferServiceClient,
}));

vi.mock("@code0-tech/tucana/pb/aquila.data_type_pb.client.js", () => ({
    DataTypeServiceClient: mocks.MockDataTypeServiceClient,
}));

vi.mock("@code0-tech/tucana/pb/aquila.runtime_function_pb.client.js", () => ({
    RuntimeFunctionDefinitionServiceClient: mocks.MockRuntimeFunctionDefinitionServiceClient,
}));

vi.mock("@code0-tech/tucana/pb/aquila.flow_type_pb.client.js", () => ({
    FlowTypeServiceClient: mocks.MockFlowTypeServiceClient,
}));

// ---------------------------------------------------------------------------
// Imports under test (placed after vi.mock so they see the mocked modules)
// ---------------------------------------------------------------------------
import {createSdk} from "../action_sdk.js";
import {RuntimeErrorException} from "../types.js";
import {constructValue} from "@code0-tech/tucana/helpers/shared.struct_helper.js";

// ---------------------------------------------------------------------------
// Shared test config
// ---------------------------------------------------------------------------
const defaultConfig = {
    authToken: "test-token",
    aquilaUrl: "localhost:50051",
    actionId: "test-action",
    version: "1.0.0",
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Builds the actionConfigurations stream message used to resolve connect(). */
function makeActionConfigurationsMessage(
    projectConfigs: {projectId: bigint; actionConfigurations: {identifier: string; value: ReturnType<typeof constructValue>}[]}[] = [
        {projectId: BigInt(1), actionConfigurations: []},
    ]
) {
    return {
        data: {
            oneofKind: "actionConfigurations",
            actionConfigurations: {actionConfigurations: projectConfigs},
        },
    };
}

/** Builds an execution stream message for the given function identifier. */
function makeExecutionMessage(
    functionIdentifier: string,
    fields: Record<string, ReturnType<typeof constructValue>> = {},
    projectId = BigInt(1),
    executionIdentifier = "exec-1"
) {
    return {
        data: {
            oneofKind: "execution",
            execution: {
                functionIdentifier,
                parameters: {fields},
                projectId,
                executionIdentifier,
            },
        },
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("createSdk", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.streamState.messages = [];

        // Regular functions are required here because Vitest uses
        // Reflect.construct(impl, args, new.target) for constructor spies,
        // and arrow functions cannot be passed to Reflect.construct.
        mocks.MockGrpcTransport.mockImplementation(function () { return {}; });
        mocks.MockActionTransferServiceClient.mockImplementation(function () {
            return {
                transfer: vi.fn().mockImplementation(() => ({
                    requests: {send: mocks.mockTransferSend},
                    responses: {
                        onError: vi.fn(),
                        [Symbol.asyncIterator]: async function* () {
                            for (const msg of mocks.streamState.messages) {
                                yield msg;
                            }
                        },
                    },
                })),
            };
        });
        mocks.MockDataTypeServiceClient.mockImplementation(function () {
            return {update: mocks.mockDataTypeUpdate};
        });
        mocks.MockRuntimeFunctionDefinitionServiceClient.mockImplementation(function () {
            return {update: mocks.mockRuntimeFunctionUpdate};
        });
        mocks.MockFlowTypeServiceClient.mockImplementation(function () {
            return {update: mocks.mockFlowTypeUpdate};
        });

        mocks.mockTransferSend.mockResolvedValue(undefined);
        mocks.mockDataTypeUpdate.mockResolvedValue({response: {success: true}});
        mocks.mockRuntimeFunctionUpdate.mockResolvedValue({response: {success: true}});
        mocks.mockFlowTypeUpdate.mockResolvedValue({response: {success: true}});
    });

    // -------------------------------------------------------------------------
    // Initialisation
    // -------------------------------------------------------------------------
    describe("initialisation", () => {
        it("returns an object that exposes all required SDK methods", () => {
            const sdk = createSdk(defaultConfig);
            expect(typeof sdk.fullyConnected).toBe("function");
            expect(typeof sdk.connect).toBe("function");
            expect(typeof sdk.registerDataType).toBe("function");
            expect(typeof sdk.registerFlowType).toBe("function");
            expect(typeof sdk.registerFunctionDefinition).toBe("function");
            expect(typeof sdk.registerConfigDefinitions).toBe("function");
            expect(typeof sdk.getProjectActionConfigurations).toBe("function");
            expect(typeof sdk.dispatchEvent).toBe("function");
            expect(typeof sdk.onError).toBe("function");
        });

        it("stores the supplied config on the returned object", () => {
            const sdk = createSdk(defaultConfig);
            expect(sdk.config).toEqual(defaultConfig);
        });

        it("reports fullyConnected as false before connect() is called", () => {
            const sdk = createSdk(defaultConfig);
            expect(sdk.fullyConnected()).toBe(false);
        });

        it("returns an empty array from getProjectActionConfigurations before connect()", () => {
            const sdk = createSdk(defaultConfig);
            expect(sdk.getProjectActionConfigurations()).toEqual([]);
        });

        it("maps configDefinitions passed to createSdk into the logon request", async () => {
            const sdk = createSdk(defaultConfig, [
                {identifier: "initial_cfg", type: "STRING"},
            ]);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const logonCall = mocks.mockTransferSend.mock.calls.find(
                ([req]: [any]) => req?.data?.oneofKind === "logon"
            );
            expect(logonCall).toBeDefined();
            expect(logonCall![0].data.logon.actionConfigurations).toHaveLength(1);
            expect(logonCall![0].data.logon.actionConfigurations[0].identifier).toBe("initial_cfg");
        });
    });

    // -------------------------------------------------------------------------
    // registerConfigDefinitions
    // -------------------------------------------------------------------------
    describe("registerConfigDefinitions", () => {
        it("resolves to undefined", async () => {
            const sdk = createSdk(defaultConfig);
            await expect(
                sdk.registerConfigDefinitions({identifier: "cfg1", type: "STRING"})
            ).resolves.toBeUndefined();
        });

        it("accepts multiple definitions in a single call", async () => {
            const sdk = createSdk(defaultConfig);
            await expect(
                sdk.registerConfigDefinitions(
                    {identifier: "cfg1", type: "STRING"},
                    {identifier: "cfg2", type: "NUMBER"}
                )
            ).resolves.toBeUndefined();
        });

        it("includes registered definitions in the logon request", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerConfigDefinitions({identifier: "cfg1", type: "STRING"});
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const logonCall = mocks.mockTransferSend.mock.calls.find(
                ([req]: [any]) => req?.data?.oneofKind === "logon"
            );
            expect(logonCall).toBeDefined();
            const logon = logonCall![0].data.logon;
            expect(logon.actionConfigurations).toHaveLength(1);
            expect(logon.actionConfigurations[0].identifier).toBe("cfg1");
        });
    });

    // -------------------------------------------------------------------------
    // registerDataType
    // -------------------------------------------------------------------------
    describe("registerDataType", () => {
        it("resolves to undefined", async () => {
            const sdk = createSdk(defaultConfig);
            await expect(
                sdk.registerDataType({identifier: "MY_TYPE", type: "string"})
            ).resolves.toBeUndefined();
        });

        it("accepts multiple data types in a single call", async () => {
            const sdk = createSdk(defaultConfig);
            await expect(
                sdk.registerDataType(
                    {identifier: "TYPE1", type: "string"},
                    {identifier: "TYPE2", type: "number"}
                )
            ).resolves.toBeUndefined();
        });

        it("sends registered data types to the server during connect", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerDataType({
                identifier: "MY_TYPE",
                type: "string",
                linkedDataTypes: ["STRING"],
            });
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            expect(mocks.mockDataTypeUpdate).toHaveBeenCalledOnce();
            const [request] = mocks.mockDataTypeUpdate.mock.calls[0];
            expect(request.dataTypes).toHaveLength(1);
            expect(request.dataTypes[0].identifier).toBe("MY_TYPE");
            expect(request.dataTypes[0].type).toBe("string");
            expect(request.dataTypes[0].linkedDataTypeIdentifiers).toEqual(["STRING"]);
            expect(request.dataTypes[0].definitionSource).toBe("action");
        });

        it("defaults the version to the sdk config version", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerDataType({identifier: "TYPE1", type: "string"});
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const [request] = mocks.mockDataTypeUpdate.mock.calls[0];
            expect(request.dataTypes[0].version).toBe(defaultConfig.version);
        });

        it("uses the version specified on the data type when provided", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerDataType({identifier: "TYPE1", type: "string", version: "2.0.0"});
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const [request] = mocks.mockDataTypeUpdate.mock.calls[0];
            expect(request.dataTypes[0].version).toBe("2.0.0");
        });
    });

    // -------------------------------------------------------------------------
    // registerFlowType
    // -------------------------------------------------------------------------
    describe("registerFlowType", () => {
        it("resolves to undefined", async () => {
            const sdk = createSdk(defaultConfig);
            await expect(
                sdk.registerFlowType({identifier: "flow1", editable: false})
            ).resolves.toBeUndefined();
        });

        it("sends the registered flow type to the server during connect", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerFlowType({
                identifier: "my_flow",
                editable: true,
                inputType: "STRING",
                returnType: "NUMBER",
            });
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            expect(mocks.mockFlowTypeUpdate).toHaveBeenCalledOnce();
            const [request] = mocks.mockFlowTypeUpdate.mock.calls[0];
            expect(request.flowTypes).toHaveLength(1);
            expect(request.flowTypes[0].identifier).toBe("my_flow");
            expect(request.flowTypes[0].editable).toBe(true);
            expect(request.flowTypes[0].inputType).toBe("STRING");
            expect(request.flowTypes[0].returnType).toBe("NUMBER");
            expect(request.flowTypes[0].definitionSource).toBe("action");
        });

        it("defaults the version to the sdk config version", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerFlowType({identifier: "flow1", editable: false});
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const [request] = mocks.mockFlowTypeUpdate.mock.calls[0];
            expect(request.flowTypes[0].version).toBe(defaultConfig.version);
        });

        it("uses the version specified on the flow type when provided", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerFlowType({identifier: "flow1", editable: false, version: "3.0.0"});
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const [request] = mocks.mockFlowTypeUpdate.mock.calls[0];
            expect(request.flowTypes[0].version).toBe("3.0.0");
        });
    });

    // -------------------------------------------------------------------------
    // registerFunctionDefinition
    // -------------------------------------------------------------------------
    describe("registerFunctionDefinition", () => {
        it("resolves to undefined", async () => {
            const sdk = createSdk(defaultConfig);
            await expect(
                sdk.registerFunctionDefinition(
                    {runtimeName: "my_func", signature: "() => void"},
                    vi.fn()
                )
            ).resolves.toBeUndefined();
        });

        it("sends the registered function to the server during connect", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerFunctionDefinition(
                {
                    runtimeName: "my_func",
                    signature: "(x: NUMBER) => NUMBER",
                    parameters: [{runtimeName: "x"}],
                    throwsError: true,
                },
                vi.fn()
            );
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            expect(mocks.mockRuntimeFunctionUpdate).toHaveBeenCalledOnce();
            const [request] = mocks.mockRuntimeFunctionUpdate.mock.calls[0];
            expect(request.runtimeFunctions).toHaveLength(1);
            expect(request.runtimeFunctions[0].runtimeName).toBe("my_func");
            expect(request.runtimeFunctions[0].signature).toBe("(x: NUMBER) => NUMBER");
            expect(request.runtimeFunctions[0].runtimeParameterDefinitions).toHaveLength(1);
            expect(request.runtimeFunctions[0].runtimeParameterDefinitions[0].runtimeName).toBe("x");
            expect(request.runtimeFunctions[0].throwsError).toBe(true);
            expect(request.runtimeFunctions[0].definitionSource).toBe("action");
        });

        it("defaults the version to the sdk config version", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerFunctionDefinition(
                {runtimeName: "fn1", signature: "() => void"},
                vi.fn()
            );
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const [request] = mocks.mockRuntimeFunctionUpdate.mock.calls[0];
            expect(request.runtimeFunctions[0].version).toBe(defaultConfig.version);
        });
    });

    // -------------------------------------------------------------------------
    // connect
    // -------------------------------------------------------------------------
    describe("connect", () => {
        it("resolves with project configurations returned by the server", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [
                makeActionConfigurationsMessage([
                    {projectId: BigInt(42), actionConfigurations: []},
                ]),
            ];
            const configs = await sdk.connect();

            expect(configs).toHaveLength(1);
            expect(configs[0].projectId).toBe(BigInt(42));
            expect(configs[0].configValues).toEqual([]);
            expect(typeof configs[0].findConfig).toBe("function");
        });

        it("sets fullyConnected to true after receiving action configurations", async () => {
            const sdk = createSdk(defaultConfig);
            expect(sdk.fullyConnected()).toBe(false);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();
            expect(sdk.fullyConnected()).toBe(true);
        });

        it("sends a logon request containing the actionId and version", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            const logonCall = mocks.mockTransferSend.mock.calls.find(
                ([req]: [any]) => req?.data?.oneofKind === "logon"
            );
            expect(logonCall).toBeDefined();
            const logon = logonCall![0].data.logon;
            expect(logon.actionIdentifier).toBe(defaultConfig.actionId);
            expect(logon.version).toBe(defaultConfig.version);
        });

        it("passes the auth token in request metadata", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            expect(mocks.mockDataTypeUpdate).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({
                    meta: expect.objectContaining({Authorization: defaultConfig.authToken}),
                })
            );
        });

        it("makes project configurations available via getProjectActionConfigurations after connect", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [
                makeActionConfigurationsMessage([
                    {projectId: BigInt(7), actionConfigurations: []},
                ]),
            ];
            await sdk.connect();

            const configs = sdk.getProjectActionConfigurations();
            expect(configs).toHaveLength(1);
            expect(configs[0].projectId).toBe(BigInt(7));
        });

        it("exposes config values via findConfig on the returned project configuration", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [
                makeActionConfigurationsMessage([
                    {
                        projectId: BigInt(1),
                        actionConfigurations: [
                            {identifier: "token", value: constructValue("secret")},
                        ],
                    },
                ]),
            ];
            const [config] = await sdk.connect();
            expect(config.findConfig("token")).toBe("secret");
            expect(config.findConfig("nonexistent")).toBeUndefined();
        });

        it("rejects when the data-type update returns a failure response", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.mockDataTypeUpdate.mockResolvedValueOnce({response: {success: false}});

            await expect(sdk.connect()).rejects.toBeDefined();
        });

        it("rejects when the runtime-function update returns a failure response", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.mockRuntimeFunctionUpdate.mockResolvedValueOnce({response: {success: false}});

            await expect(sdk.connect()).rejects.toBeDefined();
        });

        it("rejects when the flow-type update returns a failure response", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.mockFlowTypeUpdate.mockResolvedValueOnce({response: {success: false}});

            await expect(sdk.connect()).rejects.toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // dispatchEvent
    // -------------------------------------------------------------------------
    describe("dispatchEvent", () => {
        it("rejects with a descriptive message when the SDK is not yet connected", async () => {
            const sdk = createSdk(defaultConfig);
            await expect(sdk.dispatchEvent("evt", BigInt(1), null)).rejects.toMatch(
                /not connected/i
            );
        });

        it("sends an event request over the stream when connected", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            await sdk.dispatchEvent("test_event", BigInt(1), "hello");

            const eventCall = mocks.mockTransferSend.mock.calls.find(
                ([req]: [any]) => req?.data?.oneofKind === "event"
            );
            expect(eventCall).toBeDefined();
            const event = eventCall![0].data.event;
            expect(event.eventType).toBe("test_event");
            expect(event.projectId).toBe(BigInt(1));
        });

        it("converts a numeric projectId to BigInt", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            await sdk.dispatchEvent("evt", 99, null);

            const eventCall = mocks.mockTransferSend.mock.calls.find(
                ([req]: [any]) => req?.data?.oneofKind === "event"
            );
            expect(eventCall![0].data.event.projectId).toBe(BigInt(99));
        });

        it("rejects when stream.requests.send fails", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            mocks.mockTransferSend.mockRejectedValueOnce(new Error("send failed"));
            await expect(sdk.dispatchEvent("evt", BigInt(1), null)).rejects.toThrow("send failed");
        });
    });

    // -------------------------------------------------------------------------
    // handleExecutionRequest (tested via the connect stream)
    // -------------------------------------------------------------------------
    describe("handleExecutionRequest (via connect stream)", () => {
        it("calls the registered handler with converted parameter values", async () => {
            const handler = vi.fn().mockReturnValue(42);
            const sdk = createSdk(defaultConfig);
            await sdk.registerFunctionDefinition(
                {runtimeName: "add", signature: "(n: NUMBER) => NUMBER"},
                handler
            );

            mocks.streamState.messages = [
                makeActionConfigurationsMessage(),
                makeExecutionMessage("add", {n: constructValue(10)}),
            ];
            await sdk.connect();
            // Allow microtasks spawned by the background for-await to settle
            await vi.waitFor(() => expect(handler).toHaveBeenCalled());

            expect(handler).toHaveBeenCalledWith(10);
        });

        it("passes a context object as the last argument when handler arity equals params + 1", async () => {
            const handler = vi.fn().mockReturnValue(null);
            const sdk = createSdk(defaultConfig);
            await sdk.registerFunctionDefinition(
                {runtimeName: "greet", signature: "(name: STRING) => NULL"},
                // handler declares 2 params (1 value arg + 1 context)
                (name: string, _ctx: unknown) => handler(name, _ctx)
            );

            mocks.streamState.messages = [
                makeActionConfigurationsMessage(),
                makeExecutionMessage("greet", {name: constructValue("world")}),
            ];
            await sdk.connect();
            await vi.waitFor(() => expect(handler).toHaveBeenCalled());

            const [nameArg, ctxArg] = handler.mock.calls[0];
            expect(nameArg).toBe("world");
            expect(ctxArg).toMatchObject({
                projectId: BigInt(1),
                executionId: "exec-1",
                matchedConfig: expect.objectContaining({projectId: BigInt(1)}),
            });
        });

        it("sends the handler return value back as a result request", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerFunctionDefinition(
                {runtimeName: "double", signature: "(n: NUMBER) => NUMBER"},
                (n: number) => n * 2
            );

            mocks.streamState.messages = [
                makeActionConfigurationsMessage(),
                makeExecutionMessage("double", {n: constructValue(5)}, BigInt(1), "exec-42"),
            ];
            await sdk.connect();
            await vi.waitFor(() => {
                const resultCall = mocks.mockTransferSend.mock.calls.find(
                    ([req]: [any]) => req?.data?.oneofKind === "result"
                );
                expect(resultCall).toBeDefined();
            });

            const resultCall = mocks.mockTransferSend.mock.calls.find(
                ([req]: [any]) => req?.data?.oneofKind === "result"
            )!;
            expect(resultCall[0].data.result.executionIdentifier).toBe("exec-42");
        });

        it("handles a RuntimeErrorException thrown by the handler without crashing connect", async () => {
            const sdk = createSdk(defaultConfig);
            await sdk.registerFunctionDefinition(
                {runtimeName: "failing", signature: "() => void"},
                () => {
                    throw new RuntimeErrorException("oops", ["detail"]);
                }
            );

            mocks.streamState.messages = [
                makeActionConfigurationsMessage(),
                makeExecutionMessage("failing"),
            ];
            // connect() should resolve normally even though the handler throws
            await expect(sdk.connect()).resolves.toBeDefined();
        });

        it("silently skips execution when the function identifier is not registered", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [
                makeActionConfigurationsMessage(),
                makeExecutionMessage("unknown_func"),
            ];
            await expect(sdk.connect()).resolves.toBeDefined();
        });
    });

    // -------------------------------------------------------------------------
    // onError
    // -------------------------------------------------------------------------
    describe("onError", () => {
        it("registers an error handler on the stream after connect without throwing", async () => {
            const sdk = createSdk(defaultConfig);
            mocks.streamState.messages = [makeActionConfigurationsMessage()];
            await sdk.connect();

            expect(() => sdk.onError((_err: Error) => {})).not.toThrow();
        });
    });
});
