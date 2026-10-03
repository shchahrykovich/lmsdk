import { describe, it, expect, vi, afterEach } from "vitest";
import { captureGoogleWireBody } from "../helpers/provider-wire";

describe("GoogleProvider - request body on the wire", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends the google search tool when google_search_enabled is true", async () => {
    const body = await captureGoogleWireBody({
      model: "gemini-2.5-flash",
      messages: [{ role: "user", content: "Who won?" }],
      google_settings: { google_search_enabled: true },
    });

    expect(body.tools).toEqual([{ googleSearch: {} }]);
  });
});

describe("toGeminiSchema", () => {
  it("converts a JSON schema the way the Gemini SDK does", async () => {
    const { toGeminiSchema } = await import("../../../worker/providers/google-codec");

    expect(
      toGeminiSchema({
        type: "object",
        additionalProperties: false,
        properties: {
          tags: { type: "array", items: { type: "string" } },
          dose: { anyOf: [{ type: "null" }, { type: "number" }] },
          unit: { type: ["string", "null"], enum: ["mg", "g"] },
        },
        required: ["tags"],
      })
    ).toEqual({
      type: "OBJECT",
      properties: {
        tags: { type: "ARRAY", items: { type: "STRING" } },
        dose: { nullable: true, type: "NUMBER" },
        unit: { nullable: true, type: "STRING", enum: ["mg", "g"] },
      },
      required: ["tags"],
    });
  });

  it("leaves a schema that is already converted unchanged", async () => {
    const { toGeminiSchema } = await import("../../../worker/providers/google-codec");
    const converted = { type: "OBJECT", properties: { a: { type: "STRING" } } };

    expect(toGeminiSchema(converted)).toEqual(converted);
  });
});
