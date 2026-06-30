import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { Parameter } from "../src/decorators/function.dec";
import { EventSetting } from "../src/decorators/event.dec";

describe("Parameter decorator", () => {
    it("preserves source order across multiple decorators", () => {
        @Parameter({ runtimeName: "first" })
        @Parameter({ runtimeName: "second" })
        @Parameter({ runtimeName: "third" })
        class Foo {}

        const parameters = Reflect.getMetadata("hercules:function_parameters", Foo);
        expect(parameters.map((p: { runtimeName: string }) => p.runtimeName)).toEqual([
            "first",
            "second",
            "third",
        ]);
    });

    it("works for a single parameter", () => {
        @Parameter({ runtimeName: "only" })
        class Bar {}

        const parameters = Reflect.getMetadata("hercules:function_parameters", Bar);
        expect(parameters.map((p: { runtimeName: string }) => p.runtimeName)).toEqual(["only"]);
    });
});

describe("EventSetting decorator", () => {
    it("preserves source order across multiple decorators", () => {
        @EventSetting({ identifier: "first" })
        @EventSetting({ identifier: "second" })
        @EventSetting({ identifier: "third" })
        class Event {}

        const settings = Reflect.getMetadata("hercules:flow_settings", Event);
        expect(settings.map((s: { identifier: string }) => s.identifier)).toEqual([
            "first",
            "second",
            "third",
        ]);
    });
});
