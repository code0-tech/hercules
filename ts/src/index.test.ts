import { describe, it, expect } from "vitest";
import {createSdk} from "./action_sdk";

const sdk = createSdk(
    {
        authToken: "",
        version: "0.0.0",
        actionId: "test_action",
        aquilaUrl: "http://localhost:50051",
    },
)

describe("dummy test", () => {
    it('should throw errors because aquila doesnt exist', () => {
        expect(sdk.connect()).toThrowError()
    });
})