import { describe, it, expect, vi, afterEach } from "vitest";
import { env } from "cloudflare:test";
import { OpenAIProvider } from "../../../worker/providers/openai-provider";
import { GoogleProvider } from "../../../worker/providers/google-provider";
import { NullPromptExecutionLogger } from "../../../worker/providers/logger/null-prompt-execution-logger";

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

describe("execute returns cost at the standard price", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("adds cost, cached tokens and reasoning tokens to OpenAI usage", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({
        id: "resp_1",
        object: "response",
        model: "gpt-6-luna-2026-09-01",
        output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }],
        usage: {
          input_tokens: 1_000,
          input_tokens_details: { cached_tokens: 400 },
          output_tokens: 300,
          output_tokens_details: { reasoning_tokens: 200 },
          total_tokens: 1_300,
        },
      })
    );

    const result = await new OpenAIProvider("test-key", new NullPromptExecutionLogger()).execute({
      model: "gpt-6-luna",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.usage).toEqual({
      prompt_tokens: 1_000,
      completion_tokens: 300,
      total_tokens: 1_300,
      cached_tokens: 400,
      reasoning_tokens: 200,
      cost: (600 * 0.1 + 400 * 0.01 + 300 * 0.5) / 1e6,
    });
  });

  it("adds cost to Google usage", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          `data: ${JSON.stringify({
            candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
            usageMetadata: { promptTokenCount: 1_000, candidatesTokenCount: 100, thoughtsTokenCount: 50, totalTokenCount: 1_150 },
          })}\n\n`,
          { status: 200, headers: { "content-type": "text/event-stream" } }
        )
    );

    const result = await new GoogleProvider("test-key", new NullPromptExecutionLogger(), env.CACHE).execute({
      model: "gemini-2.5-flash-lite",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.usage.cost).toBeCloseTo((1_000 * 0.1 + 150 * 0.4) / 1e6, 12);
  });

  it("leaves cost out when the model has no price", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      json({
        id: "resp_2",
        object: "response",
        model: "gpt-future",
        output: [],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      })
    );

    const result = await new OpenAIProvider("test-key", new NullPromptExecutionLogger()).execute({
      model: "gpt-future",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(result.usage.cost).toBeUndefined();
  });
});
