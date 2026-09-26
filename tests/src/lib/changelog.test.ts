import { describe, expect, it } from "vitest";
import pkg from "../../../package.json";
import { CHANGELOG, compareVersions } from "../../../src/lib/changelog";

describe("compareVersions", () => {
  it("orders versions by number, not by text", () => {
    expect(compareVersions("0.1.10", "0.1.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.9", "0.1.10")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("0.1.15", "0.1.15")).toBe(0);
  });
});

describe("changelog.json", () => {
  it("has an entry for the current package.json version", () => {
    expect(CHANGELOG.map((entry) => entry.version)).toContain(pkg.version);
  });

  it("lists each version once, newest first", () => {
    const versions = CHANGELOG.map((entry) => entry.version);
    const sorted = [...versions].sort((a, b) => compareVersions(b, a));

    expect(new Set(versions).size).toBe(versions.length);
    expect(versions).toEqual(sorted);
  });

  it("gives every entry a date and at least one change", () => {
    for (const entry of CHANGELOG) {
      expect(entry.date, entry.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry.changes.length, entry.version).toBeGreaterThan(0);
      for (const change of entry.changes) {
        expect(change.trim(), entry.version).not.toBe("");
      }
    }
  });
});
