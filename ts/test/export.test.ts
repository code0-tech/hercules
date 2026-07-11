import "reflect-metadata";
import { Module } from "@code0-tech/tucana/shared";
import { afterEach, describe, expect, it } from "vitest";
import { Action, registeredActions } from "../src/action";

function createAction(identifier = "test-action") {
    return new Action(
        identifier,
        "1.2.3",
        undefined,
        "code0-tech",
        "tabler:bolt",
        "docs",
        [{ code: "en-US", content: "Test Action" }],
    );
}

describe("Action export mode", () => {
    afterEach(() => {
        delete process.env.HERCULES_EXPORT;
    });

    it("buildModule produces a Module serializable as protobuf JSON", () => {
        const action = createAction();
        const json = Module.toJson(action.buildModule());
        const roundtrip = Module.fromJson(json);
        expect(roundtrip.identifier).toBe("test-action");
        expect(roundtrip.version).toBe("1.2.3");
        expect(roundtrip.author).toBe("code0-tech");
    });

    it("registers constructed actions globally when HERCULES_EXPORT is set", () => {
        process.env.HERCULES_EXPORT = "1";
        const action = createAction("registered-action");
        const registered = registeredActions();
        expect(registered[registered.length - 1]).toBe(action);
    });

    it("does not register actions without HERCULES_EXPORT", () => {
        const before = registeredActions().length;
        createAction("unregistered-action");
        expect(registeredActions().length).toBe(before);
    });

    it("connect is a no-op in export mode even without an aquila url", async () => {
        process.env.HERCULES_EXPORT = "1";
        const action = createAction();
        await expect(action.connect("token")).resolves.toBeUndefined();
        expect(action.stream).toBeUndefined();
    });
});
