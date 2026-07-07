import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { Parameter } from "../src/decorators/function.dec";
import { EventSetting } from "../src/decorators/event.dec";
import { Identifier } from "../src/decorators/meta.dec";
import { eventMap } from "../src/map/event.map";
import { runtimeEventMap } from "../src/map/runtime_event.map";
import { Rest } from "../src/definitions/draco_rest/runtime_flow_types/rest";

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

describe("eventMap", () => {
    const restSettingOrder = [
        "httpSchema",
        "httpURL",
        "httpMethod",
        "httpAuth",
        "httpAuthValue",
        "input_schema",
    ];

    it("keeps the runtime event's setting order regardless of override order", () => {
        @Identifier("ScrambledOverrides")
        @EventSetting({ identifier: "input_schema", hidden: true, defaultValue: {} })
        @EventSetting({ identifier: "httpAuthValue", hidden: true })
        @EventSetting({ identifier: "httpSchema", hidden: true, defaultValue: "application/json" })
        @EventSetting({ identifier: "httpMethod", hidden: true, defaultValue: "POST" })
        class ScrambledOverrides extends Rest {}

        const def = eventMap(ScrambledOverrides);
        expect(def.settings?.map(s => s.identifier)).toEqual(restSettingOrder);
    });

    it("merges override properties into the runtime event's setting", () => {
        @Identifier("MethodOverride")
        @EventSetting({ identifier: "httpMethod", hidden: true, defaultValue: "POST" })
        class MethodOverride extends Rest {}

        const httpMethod = eventMap(MethodOverride).settings?.find(s => s.identifier === "httpMethod");
        expect(httpMethod?.hidden).toBe(true);
        expect(httpMethod?.defaultValue).toBe("POST");
        expect(httpMethod?.name).toEqual([{ code: "en-US", content: "Method" }]);
    });

    it("does not pollute the runtime event's settings via subclass overrides", () => {
        @Identifier("PollutionCheck")
        @EventSetting({ identifier: "httpMethod", hidden: true, defaultValue: "POST" })
        class PollutionCheck extends Rest {}

        eventMap(PollutionCheck);

        const restSettings = runtimeEventMap(Rest).settings ?? [];
        expect(restSettings.map(s => s.identifier)).toEqual(restSettingOrder);
        expect(restSettings.find(s => s.identifier === "httpMethod")?.hidden).toBeUndefined();
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
