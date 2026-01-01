import { describe, it, expect } from "vitest";
import { ObjectToPathsService } from "../../../../worker/services/object-to-paths.service";

describe("ObjectToPathsService - transform", () => {
  const service = new ObjectToPathsService();

  it("should transform simple object with primitive values", () => {
    const obj = { a: 1, b: "test", c: true };
    const result = service.transform(obj);

    expect(result).toEqual([
      { path: "a", value: 1 },
      { path: "b", value: "test" },
      { path: "c", value: true },
    ]);
  });

  it("should transform nested object into paths", () => {
    const obj = { a: { b: 1 } };
    const result = service.transform(obj);

    expect(result).toEqual([{ path: "a.b", value: 1 }]);
  });

  it("should transform deeply nested objects", () => {
    const obj = { a: { b: { c: { d: 42 } } } };
    const result = service.transform(obj);

    expect(result).toEqual([{ path: "a.b.c.d", value: 42 }]);
  });

  it("should handle multiple nested properties", () => {
    const obj = {
      user: { name: "John", age: 30 },
      settings: { theme: "dark", notifications: true },
    };
    const result = service.transform(obj);

    expect(result).toEqual([
      { path: "user.name", value: "John" },
      { path: "user.age", value: 30 },
      { path: "settings.theme", value: "dark" },
      { path: "settings.notifications", value: true },
    ]);
  });

  it("should store arrays as JSON strings", () => {
    const obj = { items: [1, 2, 3] };
    const result = service.transform(obj);

    expect(result).toEqual([{ path: "items", value: "[1,2,3]" }]);
  });

  it("should handle null values", () => {
    const obj = { a: null };
    const result = service.transform(obj);

    expect(result).toEqual([{ path: "a", value: null }]);
  });

  it("should handle undefined values", () => {
    const obj = { a: undefined };
    const result = service.transform(obj);

    expect(result).toEqual([{ path: "a", value: undefined }]);
  });

  it("should skip empty objects", () => {
    const obj = { a: {}, b: 1 };
    const result = service.transform(obj);

    expect(result).toEqual([{ path: "b", value: 1 }]);
  });

  it("should handle complex mixed structure", () => {
    const obj = {
      user: {
        profile: { name: "Alice", tags: ["admin", "user"] },
        settings: { theme: "light" },
      },
      count: 42,
    };
    const result = service.transform(obj);

    expect(result).toEqual([
      { path: "user.profile.name", value: "Alice" },
      { path: "user.profile.tags", value: '["admin","user"]' },
      { path: "user.settings.theme", value: "light" },
      { path: "count", value: 42 },
    ]);
  });
});
