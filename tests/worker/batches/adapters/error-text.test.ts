import { describe, it, expect } from "vitest";
import { errorText } from "../../../../worker/batches/adapters/batch-adapter";

describe("errorText", () => {
  it("returns the message of an error without a cause", () => {
    expect(errorText(new Error("D1 is down"))).toBe("D1 is down");
  });

  it("returns a non-error value as text", () => {
    expect(errorText("plain failure")).toBe("plain failure");
  });

  it("adds the cause that Drizzle wraps around the D1 error", () => {
    const d1Error = new Error("Too many API requests by single worker invocation.");
    const drizzleError = new Error('Failed query: select "id" from "Batches"', { cause: d1Error });

    expect(errorText(drizzleError)).toBe(
      'Failed query: select "id" from "Batches"\nCaused by: Too many API requests by single worker invocation.'
    );
  });

  it("follows a chain of causes", () => {
    const root = new Error("network connection lost");
    const middle = new Error("D1_ERROR", { cause: root });
    const top = new Error("Failed query", { cause: middle });

    expect(errorText(top)).toBe("Failed query\nCaused by: D1_ERROR\nCaused by: network connection lost");
  });

  it("adds a cause that is not an error", () => {
    expect(errorText(new Error("Failed query", { cause: "SQLITE_BUSY" }))).toBe("Failed query\nCaused by: SQLITE_BUSY");
  });

  it("stops at a cause that points back to an earlier error", () => {
    const first = new Error("first");
    const second = new Error("second", { cause: first });
    (first as { cause?: unknown }).cause = second;

    expect(errorText(first)).toBe("first\nCaused by: second");
  });
});
