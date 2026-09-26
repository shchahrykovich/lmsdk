import { describe, expect, it } from "vitest";
import { formatDuration } from "../../../src/lib/format";

describe("formatDuration", () => {
  it("shows milliseconds below one second", () => {
    expect(formatDuration(0)).toBe("0ms");
    expect(formatDuration(850)).toBe("850ms");
    expect(formatDuration(12.4)).toBe("12ms");
  });

  it("shows seconds with one decimal below one minute", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(8491)).toBe("8.5s");
    expect(formatDuration(28048)).toBe("28s");
  });

  it("shows minutes and seconds below one hour", () => {
    expect(formatDuration(291779)).toBe("4m 52s");
    expect(formatDuration(120000)).toBe("2m");
  });

  it("shows hours and minutes below one day", () => {
    expect(formatDuration(3_900_000)).toBe("1h 5m");
    expect(formatDuration(7_200_000)).toBe("2h");
  });

  it("shows days and hours from one day", () => {
    expect(formatDuration(90_000_000)).toBe("1d 1h");
  });

  it("moves to the next unit when rounding reaches the boundary", () => {
    expect(formatDuration(999.6)).toBe("1s");
    expect(formatDuration(59_960)).toBe("1m");
    expect(formatDuration(3_599_600)).toBe("1h");
  });
});
