import { describe, it, expect } from "vitest";
import { replaceAllVariables } from "../../../worker/utils/variable-replacer";

describe("Variable Replacer", () => {
  it("replaces simple variables", () => {
    const template = "Hello, {{name}}!";
    const result = replaceAllVariables(template, { name: "Ada" });

    expect(result).toBe("Hello, Ada!");
  });

  it("trims whitespace inside placeholders", () => {
    const template = "Hello, {{  name  }}!";
    const result = replaceAllVariables(template, { name: "Ada" });

    expect(result).toBe("Hello, Ada!");
  });

  it("supports nested variables", () => {
    const template = "User: {{user.name}} ({{user.id}})";
    const result = replaceAllVariables(template, { user: { name: "Ada", id: 42 } });

    expect(result).toBe("User: Ada (42)");
  });

  it("leaves unknown variables untouched", () => {
    const template = "Hello, {{name}} {{missing}}!";
    const result = replaceAllVariables(template, { name: "Ada" });

    expect(result).toBe("Hello, Ada {{missing}}!");
  });

  it("leaves placeholders when a nested path is missing", () => {
    const template = "User: {{user.name}}";
    const result = replaceAllVariables(template, { user: {} });

    expect(result).toBe("User: {{user.name}}");
  });

  it("handles null and undefined values by leaving placeholders", () => {
    const template = "Value: {{value}}";

    expect(replaceAllVariables(template, { value: null })).toBe("Value: {{value}}");
    expect(replaceAllVariables(template, { value: undefined })).toBe("Value: {{value}}");
  });

  it("stringifies non-string values", () => {
    const template = "Count: {{count}}, Active: {{active}}";
    const result = replaceAllVariables(template, { count: 3, active: false });

    expect(result).toBe("Count: 3, Active: false");
  });

  it("replaces repeated placeholders", () => {
    const template = "{{name}} {{name}}";
    const result = replaceAllVariables(template, { name: "Ada" });

    expect(result).toBe("Ada Ada");
  });

	it("replaces repeated placeholders", () => {
		const template = "{{name}}";
		const result = replaceAllVariables(template, { name: { test: 1} });

		expect(result).toBe("{\"test\":1}");
	});
});
