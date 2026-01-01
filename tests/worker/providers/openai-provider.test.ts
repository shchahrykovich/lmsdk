import { describe, it, expect, vi, beforeEach } from "vitest";
import { NullPromptExecutionLogger } from "../../../worker/providers/execution-logger";
import { OpenAIProvider } from "../../../worker/providers/openai-provider";
import type { ExecuteRequest } from "../../../worker/providers/base-provider";

// Mock the OpenAI module
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      responses = {
        create: vi.fn(),
      };
    },
  };
});

describe("OpenAIProvider", () => {
  let logger: NullPromptExecutionLogger;

  beforeEach(() => {
    logger = new NullPromptExecutionLogger();
  });
  describe("Constructor", () => {
    it("should create provider with valid API key", () => {
      const provider = new OpenAIProvider("test-api-key", logger);

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.getProviderName()).toBe("openai");
    });

    it("should throw error when API key is empty", () => {
      expect(() => new OpenAIProvider("")).toThrow("API key is required");
    });

    it("should throw error when API key is undefined", () => {
      expect(() => new OpenAIProvider(undefined as any)).toThrow("API key is required");
    });

    it("should throw error when API key is null", () => {
      expect(() => new OpenAIProvider(null as any)).toThrow("API key is required");
    });
  });

  describe("getProviderName", () => {
    it("should return 'openai'", () => {
      const provider = new OpenAIProvider("test-api-key", logger);

      expect(provider.getProviderName()).toBe("openai");
    });
  });

  describe("isModelSupported", () => {
    it("should return true for non-empty model names", () => {
      const provider = new OpenAIProvider("test-api-key", logger);

      expect(provider.isModelSupported("gpt-5.2")).toBe(true);
      expect(provider.isModelSupported("gpt-4o")).toBe(true);
      expect(provider.isModelSupported("o3")).toBe(true);
      expect(provider.isModelSupported("custom-model")).toBe(true);
    });

    it("should return false for empty model names", () => {
      const provider = new OpenAIProvider("test-api-key", logger);

      expect(provider.isModelSupported("")).toBe(false);
    });

    it("should accept any non-empty string as model name", () => {
      const provider = new OpenAIProvider("test-api-key", logger);

      expect(provider.isModelSupported("unknown-model-xyz")).toBe(true);
      expect(provider.isModelSupported("123")).toBe(true);
      expect(provider.isModelSupported("test model with spaces")).toBe(true);
    });
  });

  describe("execute - Mocked API calls", () => {
    let provider: OpenAIProvider;
    let mockCreate: any;

    beforeEach(() => {
      provider = new OpenAIProvider("test-api-key", logger);
      // Access the mocked client's create function
      mockCreate = (provider as any).client.responses.create;
      mockCreate.mockReset();
    });

    it("should execute text request with default settings", async () => {
      const mockResponse = {
        model: "gpt-5.2",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: "Hello! How can I help you?",
              },
            ],
          },
        ],
        usage: {
          input_tokens: 10,
          output_tokens: 15,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
        ],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("Hello! How can I help you?");
      expect(result.model).toBe("gpt-5.2");
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(15);
      expect(result.usage.total_tokens).toBe(25);

      // Verify API was called with correct parameters
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gpt-5.2",
          reasoning: {
            effort: "medium",
            summary: "auto",
          },
          store: true,
          include: ["reasoning.encrypted_content"],
        })
      );
    });

    it("should handle custom OpenAI settings - low effort", async () => {
      const mockResponse = {
        model: "o3",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Quick answer" }],
          },
        ],
        usage: {
          input_tokens: 5,
          output_tokens: 3,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "o3",
        messages: [{ role: "user", content: "Simple question" }],
        openai_settings: {
          reasoning_effort: "low",
          reasoning_summary: "disabled",
          store: false,
          include_encrypted_reasoning: false,
        },
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("Quick answer");

      // Verify settings were applied
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: {
            effort: "low",
            summary: "disabled",
          },
          store: false,
          include: [], // Empty because include_encrypted_reasoning is false
        })
      );
    });

    it("should handle custom OpenAI settings - high effort", async () => {
      const mockResponse = {
        model: "o3-pro",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Detailed reasoning response" }],
          },
        ],
        usage: {
          input_tokens: 100,
          output_tokens: 500,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "o3-pro",
        messages: [{ role: "user", content: "Complex problem" }],
        openai_settings: {
          reasoning_effort: "high",
          reasoning_summary: "enabled",
          store: true,
          include_encrypted_reasoning: true,
        },
      };

      await provider.execute(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: {
            effort: "high",
            summary: "enabled",
          },
          store: true,
          include: ["reasoning.encrypted_content"],
        })
      );
    });

    it("should handle JSON schema response format", async () => {
      const mockResponse = {
        model: "gpt-5.2",
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"answer": "42", "confidence": 0.95}',
              },
            ],
          },
        ],
        usage: {
          input_tokens: 20,
          output_tokens: 10,
        },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [{ role: "user", content: "What is the answer?" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "answer_schema",
            strict: true,
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
                confidence: { type: "number" },
              },
              required: ["answer"],
            },
          },
        },
      };

      const result = await provider.execute(request);

      expect(result.content).toBe('{"answer": "42", "confidence": 0.95}');

      // Verify text format was configured for JSON schema
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          text: expect.objectContaining({
            format: {
              type: "json_schema",
              name: "answer_schema",
              strict: true,
              schema: expect.any(Object),
            },
          }),
        })
      );
    });

    it("should convert system role to developer role", async () => {
      const mockResponse = {
        model: "gpt-5.2",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Response" }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [
          { role: "system", content: "System instruction" },
          { role: "user", content: "User message" },
          { role: "assistant", content: "Assistant message" },
        ],
      };

      await provider.execute(request);

      // Verify messages were converted correctly
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.input).toEqual([
        {
          role: "developer",
          content: [{ type: "input_text", text: "System instruction" }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: "User message" }],
        },
        {
          role: "assistant",
          content: [{ type: "input_text", text: "Assistant message" }],
        },
      ]);
    });

    it("should handle response with no usage data", async () => {
      const mockResponse = {
        model: "gpt-5.2",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Response without usage" }],
          },
        ],
        // No usage field
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("Response without usage");
      expect(result.usage.prompt_tokens).toBe(0);
      expect(result.usage.completion_tokens).toBe(0);
      expect(result.usage.total_tokens).toBe(0);
    });

    it("should handle empty response content", async () => {
      const mockResponse = {
        model: "gpt-5.2",
        output: [
          {
            type: "message",
            content: [],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 0 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("");
    });

    it("should handle response with multiple output items", async () => {
      const mockResponse = {
        model: "gpt-5.2",
        output: [
          {
            type: "other",
            content: "ignored",
          },
          {
            type: "message",
            content: [
              { type: "other_type", data: "ignored" },
              { type: "output_text", text: "Correct answer" },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("Correct answer");
    });

    it("should apply partial OpenAI settings with defaults", async () => {
      const mockResponse = {
        model: "gpt-5.2",
        output: [
          {
            type: "message",
            content: [{ type: "output_text", text: "Response" }],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
      };

      mockCreate.mockResolvedValue(mockResponse);

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [{ role: "user", content: "Test" }],
        openai_settings: {
          reasoning_effort: "high",
          // Other settings should use defaults
        },
      };

      await provider.execute(request);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          reasoning: {
            effort: "high",
            summary: "auto", // Default
          },
          store: true, // Default
          include: ["reasoning.encrypted_content"], // Default (include_encrypted_reasoning not false)
        })
      );
    });

    it("should handle API errors gracefully", async () => {
      mockCreate.mockRejectedValue(new Error("API Error: Rate limit exceeded"));

      const request: ExecuteRequest = {
        model: "gpt-5.2",
        messages: [{ role: "user", content: "Test" }],
      };

      await expect(provider.execute(request)).rejects.toThrow("API Error: Rate limit exceeded");
    });
  });

  describe("Integration validation", () => {
    it("should be instantiable and callable", () => {
      const provider = new OpenAIProvider("test-api-key", logger);

      expect(provider).toBeDefined();
      expect(typeof provider.execute).toBe("function");
      expect(typeof provider.getProviderName).toBe("function");
      expect(typeof provider.isModelSupported).toBe("function");
    });

    it("should return consistent provider name", () => {
      const provider1 = new OpenAIProvider("test-key-1");
      const provider2 = new OpenAIProvider("test-key-2");

      expect(provider1.getProviderName()).toBe("openai");
      expect(provider2.getProviderName()).toBe("openai");
      expect(provider1.getProviderName()).toBe(provider2.getProviderName());
    });
  });
});
