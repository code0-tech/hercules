import {describe, expect, it} from "vitest";
import {RuntimeErrorException} from "../types.js";

describe("RuntimeErrorException", () => {
    it("creates an exception with the provided message", () => {
        const err = new RuntimeErrorException("Something went wrong");
        expect(err.message).toBe("Something went wrong");
    });

    it('has the name "RuntimeErrorException"', () => {
        const err = new RuntimeErrorException("error");
        expect(err.name).toBe("RuntimeErrorException");
    });

    it("is an instance of Error", () => {
        const err = new RuntimeErrorException("error");
        expect(err).toBeInstanceOf(Error);
    });

    it("is an instance of RuntimeErrorException", () => {
        const err = new RuntimeErrorException("error");
        expect(err).toBeInstanceOf(RuntimeErrorException);
    });

    it("stores the details array when provided", () => {
        const details = ["first detail", "second detail"];
        const err = new RuntimeErrorException("error", details);
        expect(err.details).toEqual(details);
    });

    it("has undefined details when none are provided", () => {
        const err = new RuntimeErrorException("error");
        expect(err.details).toBeUndefined();
    });

    it("stores an empty details array when an empty array is provided", () => {
        const err = new RuntimeErrorException("error", []);
        expect(err.details).toEqual([]);
    });
});
