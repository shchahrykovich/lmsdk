import { describe, it, expect } from "vitest";
import { ObjectToPathsService } from "../../../../worker/services/object-to-paths.service";

describe("ObjectToPathsService - formatForSearch", () => {
  const service = new ObjectToPathsService();

  it("should format string values", () => {
    const result = service.formatForSearch({ path: "user.name", value: "Alice" });
    expect(result).toBe("Alice");
  });

  it("should format number values", () => {
    const result = service.formatForSearch({ path: "user.age", value: 30 });
    expect(result).toBe("30");
  });

  it("should format boolean values", () => {
    const result = service.formatForSearch({ path: "user.active", value: true });
    expect(result).toBe("true");
  });

  it("should format null values as empty string", () => {
    const result = service.formatForSearch({ path: "user.email", value: null });
    expect(result).toBe("");
  });

  it("should format undefined values as empty string", () => {
    const result = service.formatForSearch({ path: "user.phone", value: undefined });
    expect(result).toBe("");
  });

  it("should format JSON array strings", () => {
    const result = service.formatForSearch({ path: "user.tags", value: '["admin","user"]' });
    expect(result).toBe('["admin","user"]');
  });

  it("should format zero correctly", () => {
    const result = service.formatForSearch({ path: "count", value: 0 });
    expect(result).toBe("0");
  });

  it("should format false correctly", () => {
    const result = service.formatForSearch({ path: "enabled", value: false });
    expect(result).toBe("false");
  });

  it("should format empty string correctly", () => {
    const result = service.formatForSearch({ path: "description", value: "" });
    expect(result).toBe("");
  });

  it("should format negative numbers", () => {
    const result = service.formatForSearch({ path: "balance", value: -100.5 });
    expect(result).toBe("-100.5");
  });

  it("should format large numbers", () => {
    const result = service.formatForSearch({ path: "timestamp", value: 1234567890123 });
    expect(result).toBe("1234567890123");
  });
});
