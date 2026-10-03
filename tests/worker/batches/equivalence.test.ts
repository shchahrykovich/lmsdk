import { describe, it, expect, afterEach, vi } from "vitest";
import { OpenAIBatchAdapter } from "../../../worker/batches/adapters/openai-batch-adapter";
import { GoogleBatchAdapter } from "../../../worker/batches/adapters/google-batch-adapter";
import { AnthropicBatchAdapter } from "../../../worker/batches/adapters/anthropic-batch-adapter";
import { buildExecuteRequest, renderExecuteRequest } from "../../../worker/execution/prompt-renderer";
import { parsePromptBody } from "../../../worker/execution/prompt-body";
import type { ExecuteRequest } from "../../../worker/providers/base-provider";
import { captureAnthropicWireBody, captureGoogleWireBody, captureOpenAIWireBody } from "../helpers/provider-wire";

const variables = { article: { title: "Zinc and colds", text: "Randomized trial of 100 adults." } };

const schema = {
  name: "protocol",
  strict: true,
  schema: {
    type: "object",
    properties: { dose_mg: { type: "number" }, duration_days: { type: "number" } },
    required: ["dose_mg", "duration_days"],
    additionalProperties: false,
  },
};

const requestFor = (model: string, settings: Record<string, unknown>): ExecuteRequest => {
  const body = parsePromptBody(
    JSON.stringify({
      messages: [
        { role: "system", content: "Extract the protocol." },
        { role: "user", content: "{{article.title}}\n\n{{article.text}}" },
      ],
      response_format: { type: "json_schema", json_schema: schema },
      ...settings,
    })
  )!;
  return buildExecuteRequest({ model, projectId: 1, slug: "extract-protocol" }, body, variables);
};

describe("A batch sends the same request as execute, apart from the batch envelope", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("matches for OpenAI", async () => {
    const request = requestFor("gpt-6-luna", { openai_settings: { reasoning_effort: "low", reasoning_summary: "concise" } });

    const executeBody = await captureOpenAIWireBody(renderExecuteRequest(request));
    const batchBody = JSON.parse(new OpenAIBatchAdapter("sk-test").encodeLine("k-0", request)).body;

    expect(batchBody).toEqual(executeBody);
  });

  it("matches for Google when the system message is not cached", async () => {
    const request = requestFor("gemini-2.5-flash", {
      google_settings: { thinking_level: "LOW", include_thoughts: false, google_search_enabled: true },
    });

    const executeBody = await captureGoogleWireBody(renderExecuteRequest(request));
    const batchRequest = JSON.parse(new GoogleBatchAdapter("g-key").encodeLine("k-0", request)).request;

    expect(batchRequest).toEqual(executeBody);
  });

  it("matches for Anthropic, except the stream flag that execute adds", async () => {
    const request = requestFor("claude-sonnet-5-5", { anthropic_settings: { effort: "low", max_tokens: 4000 } });

    const { stream, ...executeBody } = await captureAnthropicWireBody(renderExecuteRequest(request));
    const batchParams = JSON.parse(new AnthropicBatchAdapter("sk-ant").encodeLine("k-0", request)).params;

    expect(stream).toBe(true);
    expect(batchParams).toEqual(executeBody);
  });
});
