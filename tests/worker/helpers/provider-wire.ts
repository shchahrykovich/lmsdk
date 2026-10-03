import { env } from "cloudflare:test";
import { vi } from "vitest";
import { GoogleProvider } from "../../../worker/providers/google-provider";
import { OpenAIProvider } from "../../../worker/providers/openai-provider";
import { AnthropicProvider } from "../../../worker/providers/anthropic-provider";
import { NullPromptExecutionLogger } from "../../../worker/providers/logger/null-prompt-execution-logger";
import type { ExecuteRequest } from "../../../worker/providers/base-provider";

const sse = (events: unknown[]) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

const anthropicSse = () =>
  new Response(
    [
      ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-sonnet-5-5", content: [], stop_reason: null, usage: { input_tokens: 5, output_tokens: 0 } } }],
      ["content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "ok" } }],
      ["content_block_stop", { type: "content_block_stop", index: 0 }],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 1 } }],
      ["message_stop", { type: "message_stop" }],
    ]
      .map(([name, data]) => `event: ${name as string}\ndata: ${JSON.stringify(data)}\n\n`)
      .join(""),
    { status: 200, headers: { "content-type": "text/event-stream" } }
  );

async function capture(respond: () => Response, run: () => Promise<unknown>): Promise<Record<string, unknown>> {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => respond());
  try {
    await run();
    const [input, init] = fetchSpy.mock.calls[0]!;
    const body = input instanceof Request ? await input.clone().text() : String(init?.body);
    return JSON.parse(body) as Record<string, unknown>;
  } finally {
    fetchSpy.mockRestore();
  }
}

export const captureGoogleWireBody = (request: ExecuteRequest) =>
  capture(
    () =>
      sse([
        {
          candidates: [{ content: { role: "model", parts: [{ text: "ok" }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 },
        },
      ]),
    () => new GoogleProvider("test-key", new NullPromptExecutionLogger(), env.CACHE).execute(request)
  );

export const captureOpenAIWireBody = (request: ExecuteRequest) =>
  capture(
    () =>
      new Response(
        JSON.stringify({ id: "resp_1", object: "response", model: request.model, output: [], usage: { input_tokens: 1, output_tokens: 1 } }),
        { status: 200, headers: { "content-type": "application/json" } }
      ),
    () => new OpenAIProvider("test-key", new NullPromptExecutionLogger()).execute(request)
  );

export const captureAnthropicWireBody = (request: ExecuteRequest) =>
  capture(anthropicSse, () => new AnthropicProvider("test-key", new NullPromptExecutionLogger()).execute(request));
