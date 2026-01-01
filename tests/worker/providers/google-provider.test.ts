import { describe, it, expect, vi, beforeEach } from "vitest";
import { GoogleProvider } from "../../../worker/providers/google-provider";
import type { ExecuteRequest } from "../../../worker/providers/base-provider";

import {NullPromptExecutionLogger} from "../../../worker/providers/logger/null-prompt-execution-logger";

// Mock the Google GenAI module
vi.mock("@google/genai", () => {
  return {
    GoogleGenAI: class MockGoogleGenAI {
      models = {
        generateContentStream: vi.fn(),
      };
    },
  };
});

describe("GoogleProvider", () => {
  let logger: NullPromptExecutionLogger;

  beforeEach(() => {
    logger = new NullPromptExecutionLogger();
  });

  describe("Constructor", () => {
    it("should create provider with valid API key", () => {
      const provider = new GoogleProvider("test-api-key", logger);

      expect(provider).toBeInstanceOf(GoogleProvider);
      expect(provider.getProviderName()).toBe("google");
    });

    it("should throw error when API key is empty", () => {
      expect(() => new GoogleProvider("", logger)).toThrow("API key is required");
    });

    it("should throw error when API key is undefined", () => {
      expect(() => new GoogleProvider(undefined as any, logger)).toThrow("API key is required");
    });

    it("should throw error when API key is null", () => {
      expect(() => new GoogleProvider(null as any, logger)).toThrow("API key is required");
    });
  });

  describe("getProviderName", () => {
    it("should return 'google'", () => {
      const provider = new GoogleProvider("test-api-key", logger);

      expect(provider.getProviderName()).toBe("google");
    });
  });

  describe("isModelSupported", () => {
    it("should return true for non-empty model names", () => {
      const provider = new GoogleProvider("test-api-key", logger);

      expect(provider.isModelSupported("gemini-2.0-flash-exp")).toBe(true);
      expect(provider.isModelSupported("gemini-1.5-pro")).toBe(true);
      expect(provider.isModelSupported("gemini-1.5-flash")).toBe(true);
      expect(provider.isModelSupported("custom-model")).toBe(true);
    });

    it("should return false for empty model names", () => {
      const provider = new GoogleProvider("test-api-key", logger);

      expect(provider.isModelSupported("")).toBe(false);
    });

    it("should accept any non-empty string as model name", () => {
      const provider = new GoogleProvider("test-api-key", logger);

      expect(provider.isModelSupported("unknown-gemini-model")).toBe(true);
      expect(provider.isModelSupported("123")).toBe(true);
      expect(provider.isModelSupported("test model with spaces")).toBe(true);
    });
  });

  describe("execute - Mocked API calls", () => {
    let provider: GoogleProvider;
    let mockGenerateContentStream: any;

    beforeEach(() => {
      provider = new GoogleProvider("test-api-key", logger);
      // Access the mocked client's generateContentStream function
      mockGenerateContentStream = (provider as any).client.models.generateContentStream;
      mockGenerateContentStream.mockReset();
    });

    // Helper to create async iterator from chunks
    async function* createMockStream(chunks: Array<{ text?: string }>) {
      for (const chunk of chunks) {
        yield chunk;
      }
    }

    it("should execute text request with system and user messages", async () => {
      const mockStream = createMockStream([
        { text: "Hello! " },
        { text: "How can " },
        { text: "I help you?" },
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
      expect(result.usage.prompt_tokens).toBe(0); // Streaming doesn't provide usage
      expect(result.usage.completion_tokens).toBe(0);
      expect(result.usage.total_tokens).toBe(0);

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

  describe("Integration validation", () => {
    it("should be instantiable and callable", () => {
      const provider = new GoogleProvider("test-api-key", logger);

      expect(provider).toBeDefined();
      expect(typeof provider.execute).toBe("function");
      expect(typeof provider.getProviderName).toBe("function");
      expect(typeof provider.isModelSupported).toBe("function");
    });

    it("should return consistent provider name", () => {
      const provider1 = new GoogleProvider("test-key-1");
      const provider2 = new GoogleProvider("test-key-2");

      expect(provider1.getProviderName()).toBe("google");
      expect(provider2.getProviderName()).toBe("google");
      expect(provider1.getProviderName()).toBe(provider2.getProviderName());
    });
  });
});
