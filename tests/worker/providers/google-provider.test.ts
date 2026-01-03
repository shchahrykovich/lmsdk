import { describe, it, expect, vi, beforeEach } from "vitest";
import { env } from "cloudflare:test";
import { GoogleProvider } from "../../../worker/providers/google-provider";
import type { ExecuteRequest } from "../../../worker/providers/base-provider";

import {NullPromptExecutionLogger} from "../../../worker/providers/logger/null-prompt-execution-logger";

const constructedOptions: any[] = [];
const mockGenerateContentStream = vi.fn();
const mockCachesCreate = vi.fn();

// Mock the Google GenAI module
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      options: any;
      constructor(options: any) {
        this.options = options;
        constructedOptions.push(options);
      }
      models = {
        generateContentStream: mockGenerateContentStream,
      };
      caches = {
        create: mockCachesCreate,
        get: vi.fn(),
        list: vi.fn(),
      };
    },
  };
});

describe("GoogleProvider", () => {
  let logger: NullPromptExecutionLogger;

  beforeEach(() => {
    logger = new NullPromptExecutionLogger();
    constructedOptions.length = 0;
  });

  describe("Constructor", () => {
    it("should create provider with valid API key", () => {
      const provider = new GoogleProvider("test-api-key", logger, env.CACHE);

      expect(provider).toBeInstanceOf(GoogleProvider);
      expect(provider.getProviderName()).toBe("google");
    });

    it("should throw error when API key is empty", () => {
      expect(() => new GoogleProvider("", logger, env.CACHE)).toThrow("API key is required");
    });

    it("should throw error when API key is undefined", () => {
      expect(() => new GoogleProvider(undefined as any, logger, env.CACHE)).toThrow("API key is required");
    });

    it("should throw error when API key is null", () => {
      expect(() => new GoogleProvider(null as any, logger, env.CACHE)).toThrow("API key is required");
    });
  });

  describe("getProviderName", () => {
    it("should return 'google'", () => {
      const provider = new GoogleProvider("test-api-key", logger, env.CACHE);

      expect(provider.getProviderName()).toBe("google");
    });
  });

  describe("isModelSupported", () => {
    it("should return true for non-empty model names", () => {
      const provider = new GoogleProvider("test-api-key", logger, env.CACHE);

      expect(provider.isModelSupported("gemini-2.0-flash-exp")).toBe(true);
      expect(provider.isModelSupported("gemini-1.5-pro")).toBe(true);
      expect(provider.isModelSupported("gemini-1.5-flash")).toBe(true);
      expect(provider.isModelSupported("custom-model")).toBe(true);
    });

    it("should return false for empty model names", () => {
      const provider = new GoogleProvider("test-api-key", logger, env.CACHE);

      expect(provider.isModelSupported("")).toBe(false);
    });

    it("should accept any non-empty string as model name", () => {
      const provider = new GoogleProvider("test-api-key", logger, env.CACHE);

      expect(provider.isModelSupported("unknown-gemini-model")).toBe(true);
      expect(provider.isModelSupported("123")).toBe(true);
      expect(provider.isModelSupported("test model with spaces")).toBe(true);
    });
  });

  describe("execute - Mocked API calls", () => {
    let provider: GoogleProvider;
    let mockGenerateContentStream: any;

    beforeEach(() => {
      provider = new GoogleProvider("test-api-key", logger, env.CACHE);
      // Access the mocked client's generateContentStream function
      mockGenerateContentStream = (provider as any).client.models.generateContentStream;
      mockGenerateContentStream.mockReset();
    });

    // Helper to create async iterator from chunks
    async function* createMockStream(chunks: { text?: string }[]) {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it("should execute text request with system and user messages", async () => {
      const mockStream = createMockStream([
        { text: "Hello! " },
        { text: "How can " },
        { text: "I help you?", usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 8, totalTokenCount: 18 } },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello!" },
        ],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("Hello! How can I help you?");
      expect(result.model).toBe("gemini-1.5-pro");
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(8);
      expect(result.usage.total_tokens).toBe(18);

      // Verify API was called with correct parameters
      expect(mockGenerateContentStream).toHaveBeenCalledWith(
        expect.objectContaining({
          model: "gemini-1.5-pro",
          config: expect.objectContaining({
            systemInstruction: "You are a helpful assistant.",
          }),
          contents: [
            {
              role: "user",
              parts: [{ text: "Hello!" }],
            },
          ],
        })
      );
    });

    it("should handle request with only user message (no system instruction)", async () => {
      const mockStream = createMockStream([{ text: "Response text" }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-2.0-flash-exp",
        messages: [{ role: "user", content: "Test message" }],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("Response text");

      // Verify no systemInstruction was set
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBeUndefined();
      expect(callArgs.contents).toEqual([
        {
          role: "user",
          parts: [{ text: "Test message" }],
        },
      ]);
    });

    it("should convert system message to user message when no user messages exist", async () => {
      const mockStream = createMockStream([{ text: "System converted response" }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "system", content: "Only system message" }],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("System converted response");

      // Verify system message was converted to user message
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBeUndefined();
      expect(callArgs.contents).toEqual([
        {
          role: "user",
          parts: [{ text: "Only system message\n\n" }], // System instruction has newlines appended
        },
      ]);
    });

    it("should handle multiple system messages combined", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "First instruction." },
          { role: "system", content: "Second instruction." },
          { role: "user", content: "User message" },
        ],
      };

      await provider.execute(request);

      // Verify multiple system messages are combined with newlines
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBe("First instruction.\n\nSecond instruction.");
    });

    it("should convert assistant role to model role", async () => {
      const mockStream = createMockStream([{ text: "Continued response" }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-flash",
        messages: [
          { role: "user", content: "What is 2+2?" },
          { role: "assistant", content: "4" },
          { role: "user", content: "What is 3+3?" },
        ],
      };

      await provider.execute(request);

      // Verify assistant role is converted to model role
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.contents).toEqual([
        {
          role: "user",
          parts: [{ text: "What is 2+2?" }],
        },
        {
          role: "model",
          parts: [{ text: "4" }],
        },
        {
          role: "user",
          parts: [{ text: "What is 3+3?" }],
        },
      ]);
    });

    it("should handle JSON schema response format with type json_schema", async () => {
      const mockStream = createMockStream([{ text: '{"answer": "42"}' }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Return JSON" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                answer: { type: "string" },
              },
              required: ["answer"],
            },
          },
        },
      };

      const result = await provider.execute(request);

      expect(result.content).toBe('{"answer": "42"}');

      // Verify JSON mode was configured
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.responseMimeType).toBe("application/json");
      expect(callArgs.config.responseSchema).toEqual({
        type: "object",
        properties: {
          answer: { type: "string" },
        },
        required: ["answer"],
      });
    });

    it("should handle JSON response format with type json", async () => {
      const mockStream = createMockStream([{ text: '{"result": "success"}' }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Return JSON" }],
        response_format: {
          type: "json",
        },
      };

      await provider.execute(request);

      // Verify JSON mode was configured without schema
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.responseMimeType).toBe("application/json");
      expect(callArgs.config.responseSchema).toBeUndefined();
    });

    it("should handle JSON schema with nested schema property", async () => {
      const mockStream = createMockStream([{ text: '{"data": {}}' }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            schema: {
              type: "object",
              properties: {
                data: { type: "object" },
              },
            },
          },
        },
      };

      await provider.execute(request);

      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.responseSchema).toEqual({
        type: "object",
        properties: {
          data: { type: "object" },
        },
      });
    });

    it("should handle JSON schema without schema wrapper", async () => {
      const mockStream = createMockStream([{ text: '{"value": 123}' }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test" }],
        response_format: {
          type: "json_schema",
          json_schema: {
            type: "object",
            properties: {
              value: { type: "number" },
            },
          },
        },
      };

      await provider.execute(request);

      // When json_schema doesn't have .schema, use the whole object as schema
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.responseSchema).toEqual({
        type: "object",
        properties: {
          value: { type: "number" },
        },
      });
    });

    it("should handle empty stream chunks", async () => {
      const mockStream = createMockStream([
        { text: "Hello" },
        {}, // Empty chunk
        { text: " World" },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-flash",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("Hello World");
    });

    it("should handle stream with no text chunks", async () => {
      const mockStream = createMockStream([{}, {}, {}]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-flash",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.content).toBe("");
    });

    it("should handle complex conversation with multiple roles", async () => {
      const mockStream = createMockStream([{ text: "Final answer" }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Question 1" },
          { role: "assistant", content: "Answer 1" },
          { role: "user", content: "Question 2" },
          { role: "assistant", content: "Answer 2" },
          { role: "user", content: "Final question" },
        ],
      };

      await provider.execute(request);

      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBe("You are helpful.");
      expect(callArgs.contents).toEqual([
        { role: "user", parts: [{ text: "Question 1" }] },
        { role: "model", parts: [{ text: "Answer 1" }] },
        { role: "user", parts: [{ text: "Question 2" }] },
        { role: "model", parts: [{ text: "Answer 2" }] },
        { role: "user", parts: [{ text: "Final question" }] },
      ]);
    });

    it("should handle text response format (default)", async () => {
      const mockStream = createMockStream([{ text: "Plain text response" }]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-flash",
        messages: [{ role: "user", content: "Test" }],
        // No response_format specified
      };

      await provider.execute(request);

      // Verify no JSON configuration was set
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.responseMimeType).toBeUndefined();
      expect(callArgs.config.responseSchema).toBeUndefined();
    });

    it("should support all official Gemini models", async () => {
      const officialModels = [
        "gemini-2.0-flash-exp",
        "gemini-exp-1206",
        "gemini-2.0-flash-thinking-exp-1219",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
      ];

      for (const model of officialModels) {
        const mockStream = createMockStream([{ text: `Response from ${model}` }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model,
          messages: [{ role: "user", content: "Test" }],
        };

        const result = await provider.execute(request);
        expect(result.model).toBe(model);
        expect(result.content).toBe(`Response from ${model}`);
      }
    });

    it("should handle API errors gracefully", async () => {
      mockGenerateContentStream.mockRejectedValue(
        new Error("API Error: Invalid API key")
      );

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test" }],
      };

      await expect(provider.execute(request)).rejects.toThrow("API Error: Invalid API key");
    });

    it("should handle streaming errors gracefully", async () => {
      async function* errorStream() {
        yield { text: "Partial " };
        throw new Error("Stream interrupted");
      }

      mockGenerateContentStream.mockResolvedValue(errorStream());

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test" }],
      };

      await expect(provider.execute(request)).rejects.toThrow("Stream interrupted");
    });

    it("should concatenate large number of stream chunks efficiently", async () => {
      const chunks = Array.from({ length: 100 }, (_, i) => ({ text: `chunk${i} ` }));
      const mockStream = createMockStream(chunks);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-flash",
        messages: [{ role: "user", content: "Generate long text" }],
      };

      const result = await provider.execute(request);

      // Verify all chunks were concatenated
      expect(result.content).toContain("chunk0 ");
      expect(result.content).toContain("chunk50 ");
      expect(result.content).toContain("chunk99 ");
      expect(result.content.split("chunk").length - 1).toBe(100);
    });
  });

  describe("Proxy settings", () => {
    let provider: GoogleProvider;
    let mockGenerateContentStream: any;

    beforeEach(() => {
      provider = new GoogleProvider("test-api-key", logger, env.CACHE, {
        token: "cf-token",
        baseUrl: "https://gateway.example",
      });
      mockGenerateContentStream = (provider as any).client.models.generateContentStream;
      mockGenerateContentStream.mockReset();
    });

    async function* createMockStream(chunks: { text?: string }[]) {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it("should use Cloudflare gateway when proxy is enabled", async () => {
      const mockStream = createMockStream([{ text: "Proxy response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test proxy" }],
        proxy: "cloudflare",
        projectId: 42,
        promptSlug: "proxy-test",
      };

      await provider.execute(request);

      const gatewayOptions = constructedOptions[constructedOptions.length - 1];
      expect(gatewayOptions.httpOptions.baseUrl).toBe("https://gateway.example/google-ai-studio");
      expect(gatewayOptions.httpOptions.headers["cf-aig-authorization"]).toBe("Bearer cf-token");
    });

    it("should fallback to default client when proxy config is missing", async () => {
      const fallbackProvider = new GoogleProvider("test-api-key", logger, env.CACHE);
      const fallbackStream = createMockStream([{ text: "Fallback response" }]);
      const fallbackGenerate = (fallbackProvider as any).client.models.generateContentStream;
      fallbackGenerate.mockReset();
      fallbackGenerate.mockResolvedValue(fallbackStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test proxy fallback" }],
        proxy: "cloudflare",
      };

      const optionsCount = constructedOptions.length;
      await fallbackProvider.execute(request);

      expect(constructedOptions.length).toBe(optionsCount);
      expect(constructedOptions[optionsCount - 1]?.httpOptions).toBeUndefined();
    });
  });

  describe("Usage metadata extraction", () => {
    let provider: GoogleProvider;
    let mockGenerateContentStream: any;

    beforeEach(() => {
      provider = new GoogleProvider("test-api-key", logger, env.CACHE);
      mockGenerateContentStream = (provider as any).client.models.generateContentStream;
      mockGenerateContentStream.mockReset();
    });

    async function* createMockStream(chunks: { text?: string; usageMetadata?: any }[]) {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it("should extract usage metadata from last chunk in stream", async () => {
      const mockStream = createMockStream([
        { text: "First chunk " },
        { text: "Second chunk " },
        {
          text: "Final chunk",
          usageMetadata: {
            promptTokenCount: 25,
            candidatesTokenCount: 42,
            totalTokenCount: 67,
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(25);
      expect(result.usage.completion_tokens).toBe(42);
      expect(result.usage.total_tokens).toBe(67);
    });

    it("should handle usage metadata in middle chunk (use last available)", async () => {
      const mockStream = createMockStream([
        { text: "First chunk " },
        {
          text: "Middle chunk with metadata",
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 20,
            totalTokenCount: 30,
          }
        },
        { text: " Final chunk without metadata" },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-flash",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      // Should use metadata from middle chunk since it's the last one with metadata
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(20);
      expect(result.usage.total_tokens).toBe(30);
    });

    it("should default to 0 when no usage metadata is provided", async () => {
      const mockStream = createMockStream([
        { text: "Chunk 1 " },
        { text: "Chunk 2 " },
        { text: "Chunk 3" },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(0);
      expect(result.usage.completion_tokens).toBe(0);
      expect(result.usage.total_tokens).toBe(0);
    });

    it("should handle partial usage metadata (some fields missing)", async () => {
      const mockStream = createMockStream([
        {
          text: "Response",
          usageMetadata: {
            promptTokenCount: 15,
            totalTokenCount: 50,
            // candidatesTokenCount is missing
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-2.0-flash-exp",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(15);
      expect(result.usage.completion_tokens).toBe(0); // Defaults to 0 when missing
      expect(result.usage.total_tokens).toBe(50);
    });

    it("should handle usage metadata with thinking tokens", async () => {
      const mockStream = createMockStream([
        {
          text: "Response with thinking",
          usageMetadata: {
            promptTokenCount: 20,
            candidatesTokenCount: 30,
            thoughtsTokenCount: 100,
            totalTokenCount: 150,
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-2.0-flash-thinking-exp-1219",
        messages: [{ role: "user", content: "Complex reasoning task" }],
        google_settings: {
          include_thoughts: true,
          thinking_level: "HIGH",
        },
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(20);
      expect(result.usage.completion_tokens).toBe(30);
      expect(result.usage.total_tokens).toBe(150);
      expect(result.usage.thoughts_tokens).toBe(100);
    });

    it("should handle usage metadata with cached content tokens", async () => {
      const mockStream = createMockStream([
        {
          text: "Response using cached content",
          usageMetadata: {
            promptTokenCount: 100,
            cachedContentTokenCount: 1000,
            candidatesTokenCount: 25,
            totalTokenCount: 1125,
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Query using cache" }],
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(100);
      expect(result.usage.completion_tokens).toBe(25);
      expect(result.usage.total_tokens).toBe(1125);
      expect(result.usage.cached_content_tokens).toBe(1000);
    });

    it("should override metadata if multiple chunks have usageMetadata", async () => {
      const mockStream = createMockStream([
        {
          text: "First ",
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 2,
            totalTokenCount: 7,
          }
        },
        { text: "Middle " },
        {
          text: "Last",
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 15,
            totalTokenCount: 25,
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-flash",
        messages: [{ role: "user", content: "Test" }],
      };

      const result = await provider.execute(request);

      // Should use the last metadata encountered
      expect(result.usage.prompt_tokens).toBe(10);
      expect(result.usage.completion_tokens).toBe(15);
      expect(result.usage.total_tokens).toBe(25);
    });

    it("should handle zero values in usage metadata", async () => {
      const mockStream = createMockStream([
        {
          text: "Empty response",
          usageMetadata: {
            promptTokenCount: 0,
            candidatesTokenCount: 0,
            totalTokenCount: 0,
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "" }],
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(0);
      expect(result.usage.completion_tokens).toBe(0);
      expect(result.usage.total_tokens).toBe(0);
    });

    it("should handle large token counts correctly", async () => {
      const mockStream = createMockStream([
        {
          text: "Very long response",
          usageMetadata: {
            promptTokenCount: 50000,
            candidatesTokenCount: 100000,
            totalTokenCount: 150000,
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Long context request" }],
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(50000);
      expect(result.usage.completion_tokens).toBe(100000);
      expect(result.usage.total_tokens).toBe(150000);
    });

    it("should handle all token types together", async () => {
      const mockStream = createMockStream([
        {
          text: "Complex response with all token types",
          usageMetadata: {
            promptTokenCount: 478,
            candidatesTokenCount: 71,
            thoughtsTokenCount: 632,
            toolUsePromptTokenCount: 50,
            cachedContentTokenCount: 200,
            totalTokenCount: 1431,
          }
        },
      ]);

      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-2.0-flash-thinking-exp-1219",
        messages: [{ role: "user", content: "Complex task with tools and caching" }],
        google_settings: {
          include_thoughts: true,
          thinking_level: "HIGH",
          google_search_enabled: true,
        },
      };

      const result = await provider.execute(request);

      expect(result.usage.prompt_tokens).toBe(478);
      expect(result.usage.completion_tokens).toBe(71);
      expect(result.usage.total_tokens).toBe(1431);
      expect(result.usage.thoughts_tokens).toBe(632);
      expect(result.usage.tool_use_prompt_tokens).toBe(50);
      expect(result.usage.cached_content_tokens).toBe(200);
    });
  });

  describe("Google-specific settings", () => {
    let provider: GoogleProvider;
    let mockGenerateContentStream: any;

    beforeEach(() => {
      provider = new GoogleProvider("test-api-key", logger, env.CACHE);
      mockGenerateContentStream = (provider as any).client.models.generateContentStream;
      mockGenerateContentStream.mockReset();
    });

    // Helper to create async iterator from chunks
    async function* createMockStream(chunks: { text?: string }[]) {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    describe("Thinking configuration", () => {
      it("should include thoughts when include_thoughts is true", async () => {
        const mockStream = createMockStream([{ text: "Response with thoughts" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            include_thoughts: true,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.includeThoughts).toBe(true);
      });

      it("should not include thoughts when include_thoughts is false", async () => {
        const mockStream = createMockStream([{ text: "Response without thoughts" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            include_thoughts: false,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.includeThoughts).toBe(false);
      });

      it.each([
        5000,
        1
      ])("should use thinking_budget when set to positive value", async (tokens: number) => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            thinking_budget: tokens,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.thinkingBudget).toBe(tokens);
        expect(callArgs.config.thinkingConfig.thinkingLevel).toBeUndefined();
      });

      it("should use thinking_level when thinking_budget is 0", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            thinking_budget: 0,
            thinking_level: "HIGH",
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.thinkingLevel).toBe("HIGH");
        expect(callArgs.config.thinkingConfig.thinkingBudget).toBeUndefined();
      });

      it("should prioritize thinking_budget over thinking_level when both provided", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            thinking_budget: 3000,
            thinking_level: "MEDIUM",
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.thinkingBudget).toBe(3000);
        expect(callArgs.config.thinkingConfig.thinkingLevel).toBeUndefined();
      });

      it("should not set thinkingConfig when thinking_level is THINKING_LEVEL_UNSPECIFIED and budget is 0", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-1.5-pro",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            thinking_budget: 0,
            thinking_level: "THINKING_LEVEL_UNSPECIFIED",
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeUndefined();
      });

      it("should support all thinking levels", async () => {
        const levels: ("LOW" | "MEDIUM" | "HIGH" | "MINIMAL")[] = ["LOW", "MEDIUM", "HIGH", "MINIMAL"];

        for (const level of levels) {
          const mockStream = createMockStream([{ text: `Response with ${level}` }]);
          mockGenerateContentStream.mockResolvedValue(mockStream);

          const request: ExecuteRequest = {
            model: "gemini-2.0-flash-thinking-exp-1219",
            messages: [{ role: "user", content: "Test" }],
            google_settings: {
              thinking_level: level,
            },
          };

          await provider.execute(request);

          const callArgs = mockGenerateContentStream.mock.calls[mockGenerateContentStream.mock.calls.length - 1][0];
          expect(callArgs.config.thinkingConfig.thinkingLevel).toBe(level);
        }
      });

      it("should combine include_thoughts with thinking_budget", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            include_thoughts: true,
            thinking_budget: 8000,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.includeThoughts).toBe(true);
        expect(callArgs.config.thinkingConfig.thinkingBudget).toBe(8000);
      });

      it("should combine include_thoughts with thinking_level", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            include_thoughts: false,
            thinking_level: "LOW",
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.includeThoughts).toBe(false);
        expect(callArgs.config.thinkingConfig.thinkingLevel).toBe("LOW");
      });
    });

    describe("Google Search tool", () => {
      it("should add google_search tool when enabled", async () => {
        const mockStream = createMockStream([{ text: "Search result response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-1.5-pro",
          messages: [{ role: "user", content: "What's the weather?" }],
          google_settings: {
            google_search_enabled: true,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.tools).toBeDefined();
        expect(callArgs.config.tools).toEqual([{ type: 'google_search' }]);
      });

      it("should not add tools when google_search is disabled", async () => {
        const mockStream = createMockStream([{ text: "Response without search" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-1.5-pro",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {
            google_search_enabled: false,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.tools).toBeUndefined();
      });

      it("should not add tools when google_settings is not provided", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-1.5-pro",
          messages: [{ role: "user", content: "Test" }],
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.tools).toBeUndefined();
      });
    });

    describe("Combined Google settings", () => {
      it("should combine all Google settings together", async () => {
        const mockStream = createMockStream([{ text: "Full config response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Complex query" }],
          google_settings: {
            include_thoughts: true,
            thinking_budget: 10000,
            google_search_enabled: true,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.includeThoughts).toBe(true);
        expect(callArgs.config.thinkingConfig.thinkingBudget).toBe(10000);
        expect(callArgs.config.tools).toEqual([{ type: 'google_search' }]);
      });

      it("should combine thinking_level with google_search", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Research question" }],
          google_settings: {
            include_thoughts: false,
            thinking_level: "HIGH",
            google_search_enabled: true,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.includeThoughts).toBe(false);
        expect(callArgs.config.thinkingConfig.thinkingLevel).toBe("HIGH");
        expect(callArgs.config.tools).toEqual([{ type: 'google_search' }]);
      });

      it("should work with JSON response format and Google settings", async () => {
        const mockStream = createMockStream([{ text: '{"answer": "structured response"}' }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-2.0-flash-thinking-exp-1219",
          messages: [{ role: "user", content: "Return structured data" }],
          response_format: {
            type: "json_schema",
            json_schema: {
              schema: {
                type: "object",
                properties: {
                  answer: { type: "string" },
                },
              },
            },
          },
          google_settings: {
            include_thoughts: true,
            thinking_level: "MEDIUM",
            google_search_enabled: true,
          },
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        // Verify JSON response format
        expect(callArgs.config.responseMimeType).toBe("application/json");
        expect(callArgs.config.responseSchema).toBeDefined();
        // Verify Google settings
        expect(callArgs.config.thinkingConfig).toBeDefined();
        expect(callArgs.config.thinkingConfig.includeThoughts).toBe(true);
        expect(callArgs.config.thinkingConfig.thinkingLevel).toBe("MEDIUM");
        expect(callArgs.config.tools).toEqual([{ type: 'google_search' }]);
      });

      it("should handle empty google_settings object", async () => {
        const mockStream = createMockStream([{ text: "Response" }]);
        mockGenerateContentStream.mockResolvedValue(mockStream);

        const request: ExecuteRequest = {
          model: "gemini-1.5-pro",
          messages: [{ role: "user", content: "Test" }],
          google_settings: {},
        };

        await provider.execute(request);

        const callArgs = mockGenerateContentStream.mock.calls[0][0];
        expect(callArgs.config.thinkingConfig).toBeUndefined();
        expect(callArgs.config.tools).toBeUndefined();
      });
    });
  });

  describe("Integration validation", () => {
    it("should be instantiable and callable", () => {
      const provider = new GoogleProvider("test-api-key", logger, env.CACHE);

      expect(provider).toBeDefined();
      expect(typeof provider.execute).toBe("function");
      expect(typeof provider.getProviderName).toBe("function");
      expect(typeof provider.isModelSupported).toBe("function");
    });

    it("should return consistent provider name", () => {
      const provider1 = new GoogleProvider("test-key-1", logger, env.CACHE);
      const provider2 = new GoogleProvider("test-key-2", logger, env.CACHE);

      expect(provider1.getProviderName()).toBe("google");
      expect(provider2.getProviderName()).toBe("google");
      expect(provider1.getProviderName()).toBe(provider2.getProviderName());
    });
  });

  describe("System message caching", () => {
    let provider: GoogleProvider;
    let mockGenerateContentStream: any;
    let mockCachesCreate: any;

    beforeEach(async () => {
      provider = new GoogleProvider("test-api-key", logger, env.CACHE);
      mockGenerateContentStream = (provider as any).client.models.generateContentStream;
      mockCachesCreate = (provider as any).client.caches.create;
      mockGenerateContentStream.mockReset();
      mockCachesCreate.mockReset();

      // Clear KV cache before each test
      const keys = await env.CACHE.list();
      for (const key of keys.keys) {
        await env.CACHE.delete(key.name);
      }
    });

    async function* createMockStream(chunks: { text?: string; usageMetadata?: any }[]) {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it("should create cache when cache_system_message is enabled with projectId and promptSlug", async () => {
      const mockStream = createMockStream([
        { text: "Response", usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 } }
      ]);
      mockGenerateContentStream.mockResolvedValue(mockStream);

      mockCachesCreate.mockResolvedValue({
        name: "cached-content-12345",
      });

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Hello" }
        ],
        google_settings: {
          cache_system_message: true,
        },
        projectId: 42,
        promptSlug: "test-prompt",
      };

      await provider.execute(request);

      // Verify cache was created with correct parameters
      expect(mockCachesCreate).toHaveBeenCalledWith({
        model: "gemini-1.5-pro",
        config: {
          systemInstruction: "You are a helpful assistant.",
          displayName: "gemini_cache_42__test-prompt",
          ttl: "3600s",
        },
      });

      // Verify cache name was stored in KV
      const cachedName = await env.CACHE.get("gemini_cache_42__test-prompt");
      expect(cachedName).toBe("cached-content-12345");
    });

    it("should generate correct cache key from projectId and promptSlug", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);
      mockCachesCreate.mockResolvedValue({ name: "cache-name-123" });

      const request: ExecuteRequest = {
        model: "gemini-2.0-flash-exp",
        messages: [
          { role: "system", content: "System message" },
          { role: "user", content: "Test" }
        ],
        google_settings: { cache_system_message: true },
        projectId: 100,
        promptSlug: "my-awesome-prompt",
      };

      await provider.execute(request);

      expect(mockCachesCreate).toHaveBeenCalled();
      const callArgs = mockCachesCreate.mock.calls[0][0];
      expect(callArgs.config.displayName).toBe("gemini_cache_100__my-awesome-prompt");

      const cachedName = await env.CACHE.get("gemini_cache_100__my-awesome-prompt");
      expect(cachedName).toBe("cache-name-123");
    });

    it("should reuse cached content on subsequent requests", async () => {
      const mockStream1 = createMockStream([{ text: "First response" }]);
      const mockStream2 = createMockStream([{ text: "Second response" }]);

      mockGenerateContentStream.mockResolvedValueOnce(mockStream1);
      mockGenerateContentStream.mockResolvedValueOnce(mockStream2);
      mockCachesCreate.mockResolvedValue({ name: "cached-content-xyz" });

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Test" }
        ],
        google_settings: { cache_system_message: true },
        projectId: 1,
        promptSlug: "reuse-test",
      };

      // First execution - should create cache
      await provider.execute(request);
      expect(mockCachesCreate).toHaveBeenCalledTimes(1);

      // Second execution - should reuse cache
      await provider.execute(request);
      expect(mockCachesCreate).toHaveBeenCalledTimes(1); // Not called again

      // Verify second call used cached content
      const secondCallArgs = mockGenerateContentStream.mock.calls[1][0];
      expect(secondCallArgs.config.cachedContent).toBe("cached-content-xyz");
      expect(secondCallArgs.config.systemInstruction).toBeUndefined();
    });

    it("should not create cache when cache_system_message is false", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "System message" },
          { role: "user", content: "Test" }
        ],
        google_settings: { cache_system_message: false },
        projectId: 1,
        promptSlug: "no-cache",
      };

      await provider.execute(request);

      expect(mockCachesCreate).not.toHaveBeenCalled();

      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBe("System message");
      expect(callArgs.config.cachedContent).toBeUndefined();
    });

    it("should not create cache when projectId is missing", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "system", content: "System message" }],
        google_settings: { cache_system_message: true },
        promptSlug: "test",
      };

      await provider.execute(request);

      expect(mockCachesCreate).not.toHaveBeenCalled();
    });

    it("should not create cache when promptSlug is missing", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "system", content: "System message" }],
        google_settings: { cache_system_message: true },
        projectId: 1,
      };

      await provider.execute(request);

      expect(mockCachesCreate).not.toHaveBeenCalled();
    });

    it("should not create cache when there is no system message", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "user", content: "Just a user message" }],
        google_settings: { cache_system_message: true },
        projectId: 1,
        promptSlug: "test",
      };

      await provider.execute(request);

      expect(mockCachesCreate).not.toHaveBeenCalled();
    });

    it("should store cache in KV with correct TTL (3600 seconds)", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);
      mockCachesCreate.mockResolvedValue({ name: "cached-ttl-test" });

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "System" },
          { role: "user", content: "Test" }
        ],
        google_settings: { cache_system_message: true },
        projectId: 1,
        promptSlug: "ttl-test",
      };

      await provider.execute(request);

      // Verify Google cache was created with TTL
      expect(mockCachesCreate).toHaveBeenCalled();
      const cacheCreateCall = mockCachesCreate.mock.calls[0][0];
      expect(cacheCreateCall.config.ttl).toBe("3600s");

      // Verify KV entry exists
      const cachedName = await env.CACHE.get("gemini_cache_1__ttl-test");
      expect(cachedName).toBe("cached-ttl-test");
    });

    it("should handle cache creation errors gracefully", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);
      mockCachesCreate.mockRejectedValue(new Error("Cache creation failed"));

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [
          { role: "system", content: "System" },
          { role: "user", content: "Test" }
        ],
        google_settings: { cache_system_message: true },
        projectId: 1,
        promptSlug: "error-test",
      };

      // Should not throw, fallback to regular execution
      const result = await provider.execute(request);
      expect(result.content).toBe("Response");

      // Should use systemInstruction instead of cache (fallback when cache fails)
      const callArgs = mockGenerateContentStream.mock.calls[0][0];
      expect(callArgs.config.systemInstruction).toBe("System");
      expect(callArgs.config.cachedContent).toBeUndefined();
    });

    it("should ignore duplicate cache errors during concurrent creation", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);
      mockGenerateContentStream.mockResolvedValue(mockStream);
      mockCachesCreate.mockRejectedValue(new Error("Cache with this name already exists (duplicate)"));

      const request: ExecuteRequest = {
        model: "gemini-1.5-pro",
        messages: [{ role: "system", content: "System" }],
        google_settings: { cache_system_message: true },
        projectId: 1,
        promptSlug: "duplicate-test",
      };

      // Should not throw
      const result = await provider.execute(request);
      expect(result.content).toBe("Response");
    });

    it("should work with different project and prompt combinations", async () => {
      const mockStream = createMockStream([{ text: "Response" }]);

      const combinations = [
        { projectId: 1, promptSlug: "prompt-a", expectedKey: "gemini_cache_1__prompt-a" },
        { projectId: 1, promptSlug: "prompt-b", expectedKey: "gemini_cache_1__prompt-b" },
        { projectId: 2, promptSlug: "prompt-a", expectedKey: "gemini_cache_2__prompt-a" },
        { projectId: 999, promptSlug: "special-prompt", expectedKey: "gemini_cache_999__special-prompt" },
      ];

      for (const combo of combinations) {
        mockGenerateContentStream.mockResolvedValue(mockStream);
        mockCachesCreate.mockResolvedValue({ name: `cache-${combo.projectId}-${combo.promptSlug}` });

        const request: ExecuteRequest = {
          model: "gemini-1.5-pro",
          messages: [
            { role: "system", content: "System" },
            { role: "user", content: "Test" }
          ],
          google_settings: { cache_system_message: true },
          projectId: combo.projectId,
          promptSlug: combo.promptSlug,
        };

        await provider.execute(request);

        const cachedName = await env.CACHE.get(combo.expectedKey);
        expect(cachedName).toBe(`cache-${combo.projectId}-${combo.promptSlug}`);
      }
    });
  });
});
