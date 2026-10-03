import { describe, it, expect, afterEach, vi } from "vitest";
import { AnthropicProvider } from "../../../worker/providers/anthropic-provider";
import { AnthropicRefusalError, anthropicResult, buildAnthropicRequest } from "../../../worker/providers/anthropic-codec";
import { NullPromptExecutionLogger } from "../../../worker/providers/logger/null-prompt-execution-logger";
import { captureAnthropicWireBody } from "../helpers/provider-wire";

describe("buildAnthropicRequest", () => {
  it("joins system messages, keeps turns and uses the default max_tokens", () => {
    expect(
      buildAnthropicRequest({
        model: "claude-opus-5-5",
        messages: [
          { role: "system", content: "A" },
          { role: "system", content: "B" },
          { role: "user", content: "hi" },
          { role: "assistant", content: "hello" },
          { role: "user", content: "more" },
        ],
      })
    ).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: "A\n\nB",
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
        { role: "user", content: "more" },
      ],
    });
  });

  it("sends a prompt with only a system message as the user turn", () => {
    expect(buildAnthropicRequest({ model: "m", messages: [{ role: "system", content: "Do it" }] }).messages).toEqual([
      { role: "user", content: "Do it" },
    ]);
  });

  it("translates json_schema into structured outputs and passes effort and max_tokens", () => {
    const request = buildAnthropicRequest({
      model: "claude-sonnet-5-5",
      messages: [{ role: "user", content: "x" }],
      response_format: { type: "json_schema", json_schema: { name: "r", schema: { type: "object" } } },
      anthropic_settings: { effort: "low", max_tokens: 2000 },
    });

    expect(request).toMatchObject({
      max_tokens: 2000,
      output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object" } } },
    });
  });
});

describe("anthropicResult", () => {
  it("joins text blocks and prices cache reads and writes", () => {
    const result = anthropicResult({
      requestedModel: "claude-haiku-4-5",
      tier: "standard",
      message: {
        model: "claude-haiku-4-5",
        stop_reason: "end_turn",
        content: [
          { type: "text", text: "a", citations: null },
          { type: "text", text: "b", citations: null },
        ],
        usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 20 } as never,
      },
    });

    expect(result).toEqual({
      content: "ab",
      model: "claude-haiku-4-5",
      usage: {
        prompt_tokens: 170,
        completion_tokens: 10,
        total_tokens: 180,
        cached_tokens: 50,
        cache_creation_tokens: 20,
        cost: (100 * 1 + 50 * 0.1 + 20 * 1.25 + 10 * 5) / 1e6,
      },
    });
  });

  it("throws on a refusal so the caller sees an error, not an empty answer", () => {
    expect(() =>
      anthropicResult({
        requestedModel: "claude-opus-5-5",
        tier: "standard",
        message: { model: "claude-opus-5-5", stop_reason: "refusal", content: [], usage: { input_tokens: 1, output_tokens: 0 } as never, stop_details: { category: "bio" } },
      })
    ).toThrow(AnthropicRefusalError);
  });
});

describe("AnthropicProvider.execute", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("streams the message and returns its text and usage", async () => {
    const body = await captureAnthropicWireBody({ model: "claude-sonnet-5-5", messages: [{ role: "user", content: "hi" }] });

    expect(body).toMatchObject({ model: "claude-sonnet-5-5", stream: true, max_tokens: 16000 });
  });

  it("requires an API key", () => {
    expect(() => new AnthropicProvider("", new NullPromptExecutionLogger())).toThrow("API key is required");
  });
});
