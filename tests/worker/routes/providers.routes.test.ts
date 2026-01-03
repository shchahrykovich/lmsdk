import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "../../../worker/index";

const mockGetSession = vi.fn();
const getProvidersMock = vi.fn();
const executePromptMock = vi.fn();

vi.mock("../../../auth", () => ({
  createAuth: vi.fn(() => ({
    api: {
      getSession: mockGetSession,
    },
  })),
}));

vi.mock("../../../worker/services/provider.service", () => ({
  ProviderService: class {
    getProviders = getProvidersMock;
    executePrompt = executePromptMock;
  },
}));

describe("Providers Routes", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockGetSession.mockReset();
    getProvidersMock.mockReset();
    executePromptMock.mockReset();
  });

  const setAuthenticatedUser = (tenantId = 1) => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "user-123",
        name: "Test User",
        email: "test@example.com",
        tenantId,
        emailVerified: true,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      session: { id: "session-123" },
    });
  };

  describe("GET /api/providers", () => {
    it("returns list of providers for authenticated user", async () => {
      setAuthenticatedUser(1);
      const providers = [
        {
          id: "openai",
          name: "OpenAI",
          description: "OpenAI GPT models",
          models: [
            { id: "gpt-4", name: "GPT-4" },
            { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
          ],
        },
        {
          id: "google",
          name: "Google",
          description: "Google Gemini models",
          models: [
            { id: "gemini-pro", name: "Gemini Pro" },
          ],
        },
      ];
      getProvidersMock.mockReturnValue(providers);

      const response = await app.request(
        "/api/providers",
        {},
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.providers).toEqual(providers);
      expect(getProvidersMock).toHaveBeenCalled();
    });

    it("returns empty array when no providers available", async () => {
      setAuthenticatedUser(1);
      getProvidersMock.mockReturnValue([]);

      const response = await app.request(
        "/api/providers",
        {},
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.providers).toEqual([]);
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/providers",
        {},
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("returns 401 when user has no valid tenant", async () => {
      setAuthenticatedUser(-1);

      const response = await app.request(
        "/api/providers",
        {},
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });
  });

  describe("POST /api/providers/execute", () => {
    it("executes prompt successfully with valid data", async () => {
      setAuthenticatedUser(1);
      const executeResult = {
        content: "Hello, world!",
        metadata: {
          model: "gpt-4",
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
      };
      executePromptMock.mockResolvedValue(executeResult);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [
              { role: "user", content: "Hello" },
            ],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.result).toEqual(executeResult);
      expect(executePromptMock).toHaveBeenCalledWith("openai", {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello" }],
        variables: undefined,
        response_format: undefined,
        google_settings: undefined,
        openai_settings: undefined,
      });
    });

    it("executes prompt with variables and settings", async () => {
      setAuthenticatedUser(1);
      const executeResult = {
        content: "Response",
        metadata: { model: "gpt-4" },
      };
      executePromptMock.mockResolvedValue(executeResult);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello {{name}}" }],
            variables: { name: "Alice" },
            response_format: { type: "text" },
            openai_settings: { temperature: 0.7 },
            google_settings: { topK: 40 },
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
      expect(executePromptMock).toHaveBeenCalledWith("openai", {
        model: "gpt-4",
        messages: [{ role: "user", content: "Hello {{name}}" }],
        variables: { name: "Alice" },
        response_format: { type: "text" },
        google_settings: { topK: 40 },
        openai_settings: { temperature: 0.7 },
      });
    });

    it("returns 400 when provider is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Missing required fields: provider, model, and messages are required");
      expect(executePromptMock).not.toHaveBeenCalled();
    });

    it("returns 400 when model is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            messages: [{ role: "user", content: "Hello" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Missing required fields: provider, model, and messages are required");
      expect(executePromptMock).not.toHaveBeenCalled();
    });

    it("returns 400 when messages is missing", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Missing required fields: provider, model, and messages are required");
      expect(executePromptMock).not.toHaveBeenCalled();
    });

    it("returns 400 when messages is not an array", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: "not an array",
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Missing required fields: provider, model, and messages are required");
      expect(executePromptMock).not.toHaveBeenCalled();
    });

    it("returns 400 when messages array is empty", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("At least one message is required");
      expect(executePromptMock).not.toHaveBeenCalled();
    });

    it("returns 400 when message is missing role field", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [{ content: "Hello" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Each message must have 'role' and 'content' fields");
      expect(executePromptMock).not.toHaveBeenCalled();
    });

    it("returns 400 when message is missing content field", async () => {
      setAuthenticatedUser(1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [{ role: "user" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe("Each message must have 'role' and 'content' fields");
      expect(executePromptMock).not.toHaveBeenCalled();
    });

    it("returns 401 when no session is present", async () => {
      mockGetSession.mockResolvedValue(null);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Authentication required" });
    });

    it("returns 401 when user has no valid tenant", async () => {
      setAuthenticatedUser(-1);

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data).toEqual({ error: "Unauthorized - Invalid tenant" });
    });

    it("returns 500 when service throws error", async () => {
      setAuthenticatedUser(1);
      executePromptMock.mockRejectedValue(new Error("Provider error"));

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Provider error");
    });

    it("returns 500 with generic error message for unknown errors", async () => {
      setAuthenticatedUser(1);
      executePromptMock.mockRejectedValue("Unknown error");

      const response = await app.request(
        "/api/providers/execute",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: "openai",
            model: "gpt-4",
            messages: [{ role: "user", content: "Hello" }],
          }),
        },
        {
          DB: {} as any,
          PRIVATE_FILES: {} as any,
          OPEN_AI_API_KEY: "test-key",
          GEMINI_API_KEY: "test-key",
        }
      );

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe("Unknown error occurred");
    });
  });
});
