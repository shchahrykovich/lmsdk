import { describe, it, expect, beforeEach, vi } from "vitest";
import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import app from "../../../../worker/index";
import { handler } from "../../../../worker/queue/handler";
import type { ExecutionLogQueueMessage } from "../../../../worker/queue/messages";
import { manage, setupFixtures, type Fixtures } from "./manage/helpers";
import { openRouterCompletion } from "../../helpers/openrouter-fixtures";

const mockChatCreate = vi.fn();

vi.mock("openai", () => ({
  default: class MockOpenAI {
    chat = { completions: { create: mockChatCreate } };
  },
}));

const TEST_OPENROUTER_KEY = "sk-or-test";
const schema = { type: "object", properties: { queue: { type: "string" } }, required: ["queue"] };

type LogRow = {
  id: number;
  tenantId: number;
  projectId: number;
  promptId: number;
  version: number;
  isSuccess: number;
  logPath: string;
  provider: string | null;
  model: string | null;
  usage: string | null;
};

const readLog = () => env.DB.prepare("SELECT * FROM PromptExecutionLogs ORDER BY id DESC LIMIT 1").first<LogRow>();

describe("E2E - API run of an OpenRouter prompt", () => {
  let f: Fixtures;

  beforeEach(async () => {
    f = await setupFixtures();
    mockChatCreate.mockReset();
    mockChatCreate.mockResolvedValue({
      ...openRouterCompletion("anthropic/claude-sonnet-5-20260801"),
      choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: '{"queue":"billing"}' } }],
    });
  });

  it("runs the prompt, logs it without the key, and stores its usage after the queue step", async () => {
    const created = await manage("/projects/support/prompts", f.keys.write, {
      method: "POST",
      body: {
        name: "Claude router",
        slug: "claude-router",
        provider: "openrouter",
        model: "anthropic/claude-sonnet-5",
        body: {
          messages: [{ role: "user", content: "Route: {{ticket}}" }],
          response_format: { type: "json_schema", json_schema: { name: "route", schema } },
        },
      },
    });
    expect(created.status).toBe(201);

    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/v1/projects/support/prompts/claude-router/execute",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": f.keys.write },
        body: JSON.stringify({ variables: { ticket: "I was charged twice" } }),
      },
      { ...env, OPENROUTER_API_KEY: TEST_OPENROUTER_KEY },
      ctx
    );
    expect(res.status).toBe(200);
    const body = await res.json<Record<string, unknown>>();
    expect(body.response).toEqual({ queue: "billing" });

    expect(mockChatCreate).toHaveBeenCalledTimes(1);
    const payload = mockChatCreate.mock.calls[0][0];
    expect(payload.messages).toEqual([{ role: "user", content: "Route: I was charged twice" }]);
    expect(payload.response_format.json_schema.schema).toEqual(schema);
    expect(payload.provider).toEqual({ require_parameters: true });

    await waitOnExecutionContext(ctx);

    const logged = await readLog();
    expect(logged).toMatchObject({ isSuccess: 1, provider: null, usage: null });
    expect(body).toMatchObject({
      model: "anthropic/claude-sonnet-5-20260801",
      provider: "openrouter",
      version: 1,
      logId: logged!.id,
      usage: {
        prompt_tokens: 120,
        completion_tokens: 80,
        total_tokens: 200,
        cached_tokens: 40,
        reasoning_tokens: 30,
        cost: 0.0012,
      },
    });
    const inputText = await (await env.PRIVATE_FILES.get(`${logged!.logPath}/input.json`))!.text();
    const outputText = await (await env.PRIVATE_FILES.get(`${logged!.logPath}/output.json`))!.text();
    expect(JSON.parse(inputText)).toMatchObject({ model: "anthropic/claude-sonnet-5" });
    expect(JSON.parse(outputText)).toHaveProperty("usage");
    expect(inputText + outputText).not.toContain(TEST_OPENROUTER_KEY);

    const message = {
      body: {
        tenantId: logged!.tenantId,
        projectId: logged!.projectId,
        promptId: logged!.promptId,
        version: logged!.version,
        logId: logged!.id,
      } as ExecutionLogQueueMessage,
      ack: vi.fn(),
      retry: vi.fn(),
    };
    await handler({ messages: [message], queue: "execution-logs" } as unknown as MessageBatch<ExecutionLogQueueMessage>, env);
    expect(message.ack).toHaveBeenCalledTimes(1);

    const processed = await readLog();
    expect(processed?.provider).toBe("openrouter");
    expect(processed?.model).toBe("anthropic/claude-sonnet-5-20260801");
    expect(JSON.parse(processed!.usage!)).toEqual({
      prompt_tokens: 120,
      cached_tokens: 40,
      completion_tokens: 80,
      reasoning_tokens: 30,
      total_tokens: 200,
    });
  });

  it("sends the reasoning effort and provider sort saved in the prompt version", async () => {
    const created = await manage("/projects/support/prompts", f.keys.write, {
      method: "POST",
      body: {
        name: "Fast scorer",
        slug: "fast-scorer",
        provider: "openrouter",
        model: "deepseek/deepseek-v4.1-flash",
        body: {
          messages: [{ role: "user", content: "Score: {{product}}" }],
          response_format: { type: "json" },
          openrouter_settings: {
            reasoning_effort: "none",
            provider_sort: "throughput",
            temperature: 0,
            max_tokens: 1200,
          },
        },
      },
    });
    expect(created.status).toBe(201);

    const ctx = createExecutionContext();
    const res = await app.request(
      "/api/v1/projects/support/prompts/fast-scorer/execute",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": f.keys.write },
        body: JSON.stringify({ variables: { product: "Vitamin D3 2000 IU" } }),
      },
      { ...env, OPENROUTER_API_KEY: TEST_OPENROUTER_KEY },
      ctx
    );
    expect(res.status).toBe(200);
    await waitOnExecutionContext(ctx);

    const payload = mockChatCreate.mock.calls[0][0];
    expect(payload.reasoning).toEqual({ effort: "none" });
    expect(payload.provider).toEqual({ require_parameters: true, sort: "throughput" });
    expect(payload.temperature).toBe(0);
    expect(payload.max_tokens).toBe(1200);
  });
});
