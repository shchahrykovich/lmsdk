import { describe, it, expect, vi, beforeEach } from "vitest";
import { OpenRouterProvider } from "../../../worker/providers/openrouter-provider";
import type { ExecuteRequest } from "../../../worker/providers/base-provider";
import { CapturingLogger } from "../helpers/capturing-logger";

const constructedOptions: any[] = [];
const mockChatCreate = vi.fn();

vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      options: any;
      constructor(options: any) {
        this.options = options;
        constructedOptions.push(options);
      }
      chat = {
        completions: {
          create: mockChatCreate,
        },
      };
    },
  };
});

const API_KEY = "sk-or-test-key";

const completion = (overrides: Record<string, unknown> = {}) => ({
  id: "gen-1",
  object: "chat.completion",
  model: "anthropic/claude-sonnet-5",
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: "Hello from OpenRouter" },
    },
  ],
  usage: {
    prompt_tokens: 12,
    completion_tokens: 8,
    total_tokens: 20,
    cost: 0.00012,
    prompt_tokens_details: { cached_tokens: 4 },
    completion_tokens_details: { reasoning_tokens: 3 },
  },
  ...overrides,
});

const baseRequest = (overrides: Partial<ExecuteRequest> = {}): ExecuteRequest => ({
  model: "anthropic/claude-sonnet-5",
  messages: [{ role: "user", content: "Hi" }],
  ...overrides,
});

describe("OpenRouterProvider", () => {
  let logger: CapturingLogger;
  let provider: OpenRouterProvider;

  beforeEach(() => {
    constructedOptions.length = 0;
    mockChatCreate.mockReset();
    logger = new CapturingLogger();
    provider = new OpenRouterProvider(API_KEY, logger);
  });

  describe("Constructor", () => {
    it("rejects an empty API key", () => {
      expect(() => new OpenRouterProvider("", logger)).toThrow("API key is required");
    });

    it("reports its provider name", () => {
      expect(provider.getProviderName()).toBe("openrouter");
    });

    it("points the client at the OpenRouter API with a 240 s timeout and no SDK retries", () => {
      expect(constructedOptions[0]).toEqual({
        apiKey: API_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        timeout: 240_000,
        maxRetries: 0,
      });
    });
  });

  describe("Request mapping", () => {
    it("sends system, user and assistant messages unchanged", async () => {
      mockChatCreate.mockResolvedValue(completion());
      const messages: ExecuteRequest["messages"] = [
        { role: "system", content: "Be brief" },
        { role: "user", content: "Hi" },
        { role: "assistant", content: "Hello" },
        { role: "user", content: "Again" },
      ];

      await provider.execute(baseRequest({ messages }));

      expect(mockChatCreate).toHaveBeenCalledWith({
        model: "anthropic/claude-sonnet-5",
        messages,
      });
    });

    it("maps a JSON schema and requires hosts that support it", async () => {
      mockChatCreate.mockResolvedValue(completion());
      const schema = { type: "object", properties: { answer: { type: "string" } } };

      await provider.execute(
        baseRequest({ response_format: { type: "json_schema", json_schema: { name: "reply", schema } } })
      );

      const payload = mockChatCreate.mock.calls[0][0];
      expect(payload.response_format).toEqual({
        type: "json_schema",
        json_schema: { name: "reply", strict: true, schema },
      });
      expect(payload.provider).toEqual({ require_parameters: true });
    });

    it("uses the whole json_schema object as the schema when it has no schema field", async () => {
      mockChatCreate.mockResolvedValue(completion());
      const jsonSchema = { type: "object", properties: {} };

      await provider.execute(baseRequest({ response_format: { type: "json_schema", json_schema: jsonSchema } }));

      expect(mockChatCreate.mock.calls[0][0].response_format).toEqual({
        type: "json_schema",
        json_schema: { name: "response", strict: true, schema: jsonSchema },
      });
    });

    it("maps the json type to json_object and requires hosts that support it", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ response_format: { type: "json" } }));

      const payload = mockChatCreate.mock.calls[0][0];
      expect(payload.response_format).toEqual({ type: "json_object" });
      expect(payload.provider).toEqual({ require_parameters: true });
    });

    it("sends no response format and no provider routing for text", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ response_format: { type: "text" } }));

      const payload = mockChatCreate.mock.calls[0][0];
      expect(payload).not.toHaveProperty("response_format");
      expect(payload).not.toHaveProperty("provider");
    });

    it("does not send OpenAI or Google settings", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(
        baseRequest({
          openai_settings: { reasoning_effort: "high", store: true },
          google_settings: { include_thoughts: true },
        })
      );

      expect(Object.keys(mockChatCreate.mock.calls[0][0]).sort()).toEqual(["messages", "model"]);
    });
  });

  describe("OpenRouter settings", () => {
    it("sends the reasoning effort", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ openrouter_settings: { reasoning_effort: "low" } }));

      expect(mockChatCreate.mock.calls[0][0].reasoning).toEqual({ effort: "low" });
    });

    it("sends effort none to turn reasoning off", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ openrouter_settings: { reasoning_effort: "none" } }));

      expect(mockChatCreate.mock.calls[0][0].reasoning).toEqual({ effort: "none" });
    });

    it("sends the provider sort order", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ openrouter_settings: { provider_sort: "throughput" } }));

      expect(mockChatCreate.mock.calls[0][0].provider).toEqual({ sort: "throughput" });
    });

    it("keeps require_parameters for JSON when a provider sort is set", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(
        baseRequest({ response_format: { type: "json" }, openrouter_settings: { provider_sort: "latency" } })
      );

      expect(mockChatCreate.mock.calls[0][0].provider).toEqual({ require_parameters: true, sort: "latency" });
    });

    it("sends temperature and max_tokens", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ openrouter_settings: { temperature: 0.2, max_tokens: 1500 } }));

      const payload = mockChatCreate.mock.calls[0][0];
      expect(payload.temperature).toBe(0.2);
      expect(payload.max_tokens).toBe(1500);
    });

    it("sends temperature 0", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ openrouter_settings: { temperature: 0 } }));

      expect(mockChatCreate.mock.calls[0][0]).toHaveProperty("temperature", 0);
    });

    it("sends no reasoning and no provider routing for empty settings", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ openrouter_settings: {} }));

      expect(Object.keys(mockChatCreate.mock.calls[0][0]).sort()).toEqual(["messages", "model"]);
    });

    it("logs the reasoning and provider settings in the input payload", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(
        baseRequest({ openrouter_settings: { reasoning_effort: "minimal", provider_sort: "price" } })
      );

      expect(logger.inputs[0]).toMatchObject({ reasoning: { effort: "minimal" }, provider: { sort: "price" } });
    });
  });

  describe("Response mapping", () => {
    it("returns content, the model from the response, and token usage with cost", async () => {
      mockChatCreate.mockResolvedValue(completion({ model: "anthropic/claude-sonnet-5-20260801" }));

      const result = await provider.execute(baseRequest());

      expect(result.content).toBe("Hello from OpenRouter");
      expect(result.model).toBe("anthropic/claude-sonnet-5-20260801");
      expect(result.usage).toEqual({
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20,
        cached_tokens: 4,
        reasoning_tokens: 3,
        cost: 0.00012,
      });
      expect(result.duration_ms).toBeGreaterThanOrEqual(0);
    });

    it("leaves out cost and token details that OpenRouter did not report", async () => {
      mockChatCreate.mockResolvedValue(
        completion({ usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 } })
      );

      const result = await provider.execute(baseRequest());

      expect(result.usage).toEqual({ prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 });
    });

    it("returns an empty string when the message content is null", async () => {
      mockChatCreate.mockResolvedValue(
        completion({
          choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: null } }],
        })
      );

      const result = await provider.execute(baseRequest());

      expect(result.content).toBe("");
      expect(logger.successes).toHaveLength(1);
    });

    it("logs the request as input and the raw response as output", async () => {
      const response = completion();
      mockChatCreate.mockResolvedValue(response);

      const result = await provider.execute(baseRequest());

      expect(logger.inputs).toEqual([{ model: "anthropic/claude-sonnet-5", messages: [{ role: "user", content: "Hi" }] }]);
      expect(logger.outputs).toEqual([response]);
      expect(logger.results).toEqual([result]);
      expect(logger.successes).toHaveLength(1);
      expect(logger.errors).toHaveLength(0);
    });

    it("logs variables when they are given", async () => {
      mockChatCreate.mockResolvedValue(completion());

      await provider.execute(baseRequest({ variables: { name: "Ann" } }));

      expect(logger.variables).toEqual([{ name: "Ann" }]);
    });
  });

  describe("Errors", () => {
    it("throws when an HTTP 200 body holds only an error object", async () => {
      const errorBody = { error: { code: 502, message: "upstream failed" } };
      mockChatCreate.mockResolvedValue(errorBody);

      await expect(provider.execute(baseRequest())).rejects.toThrow("OpenRouter error 502: upstream failed");

      expect(logger.outputs).toEqual([errorBody]);
      expect(logger.errors).toHaveLength(1);
      expect(logger.errors[0].errorMessage).toBe("OpenRouter error 502: upstream failed");
      expect(logger.successes).toHaveLength(0);
    });

    it("throws when the body has no choices and no error object", async () => {
      mockChatCreate.mockResolvedValue({ id: "gen-2", model: "anthropic/claude-sonnet-5" });

      await expect(provider.execute(baseRequest())).rejects.toThrow("OpenRouter error unknown: response has no choices");

      expect(logger.errors).toHaveLength(1);
    });

    it("throws when the first choice finished with an error", async () => {
      mockChatCreate.mockResolvedValue(
        completion({
          choices: [
            {
              index: 0,
              finish_reason: "error",
              message: { role: "assistant", content: "partial" },
              error: { code: 500, message: "model crashed" },
            },
          ],
        })
      );

      await expect(provider.execute(baseRequest())).rejects.toThrow("OpenRouter error 500: model crashed");

      expect(logger.errors).toHaveLength(1);
      expect(logger.successes).toHaveLength(0);
    });

    it("logs and rethrows an error thrown by the SDK", async () => {
      const apiError = Object.assign(new Error("402 Insufficient credits"), { status: 402 });
      mockChatCreate.mockRejectedValue(apiError);

      await expect(provider.execute(baseRequest())).rejects.toBe(apiError);

      expect(logger.errors).toEqual([{ durationMs: expect.any(Number), errorMessage: "402 Insufficient credits" }]);
    });

    it("never writes the API key into a logged payload", async () => {
      mockChatCreate.mockResolvedValue(completion());
      await provider.execute(baseRequest({ variables: { a: 1 }, response_format: { type: "json" } }));
      mockChatCreate.mockResolvedValue({ error: { code: 401, message: "bad key" } });
      await expect(provider.execute(baseRequest())).rejects.toThrow();

      expect(logger.allPayloadsAsText()).not.toContain(API_KEY);
    });
  });

  describe("Proxy settings", () => {
    it("uses the Cloudflare AI Gateway route for OpenRouter when proxy is enabled", async () => {
      const proxied = new OpenRouterProvider(API_KEY, logger, {
        token: "cf-token",
        baseUrl: "https://gateway.example",
      });
      mockChatCreate.mockResolvedValue(completion());

      await proxied.execute(baseRequest({ proxy: "cloudflare" }));

      const gatewayOptions = constructedOptions[constructedOptions.length - 1];
      expect(gatewayOptions.baseURL).toBe("https://gateway.example/openrouter");
      expect(gatewayOptions.apiKey).toBe(API_KEY);
      expect(gatewayOptions.defaultHeaders["cf-aig-authorization"]).toBe("Bearer cf-token");
      expect(gatewayOptions.timeout).toBe(240_000);
      expect(gatewayOptions.maxRetries).toBe(0);
    });

    it("uses the direct client when the gateway token is missing", async () => {
      const unproxied = new OpenRouterProvider(API_KEY, logger, { baseUrl: "https://gateway.example" });
      mockChatCreate.mockResolvedValue(completion());
      const optionsCount = constructedOptions.length;

      await unproxied.execute(baseRequest({ proxy: "cloudflare" }));

      expect(constructedOptions.length).toBe(optionsCount);
      expect(constructedOptions[optionsCount - 1].baseURL).toBe("https://openrouter.ai/api/v1");
    });

    it("uses the direct client when proxy is none", async () => {
      const proxied = new OpenRouterProvider(API_KEY, logger, {
        token: "cf-token",
        baseUrl: "https://gateway.example",
      });
      mockChatCreate.mockResolvedValue(completion());
      const optionsCount = constructedOptions.length;

      await proxied.execute(baseRequest({ proxy: "none" }));

      expect(constructedOptions.length).toBe(optionsCount);
    });
  });
});
