import { describe, it, expect, beforeEach } from "vitest";
import { ProviderService } from "../../../../worker/services/provider.service";

describe("ProviderService - getProviders", () => {
  let providerService: ProviderService;

  beforeEach(() => {
    providerService = new ProviderService();
  });

  it("should return list of available providers", () => {
    const providers = providerService.getProviders();

    expect(providers).toHaveLength(2);
    expect(providers[0]).toEqual({
      id: "openai",
      name: "OpenAI",
      description: expect.any(String),
      models: expect.any(Array),
    });
    expect(providers[1]).toEqual({
      id: "google",
      name: "Google",
      description: expect.any(String),
      models: expect.any(Array),
    });
  });

  it("should include OpenAI models from SDK types", () => {
    const providers = providerService.getProviders();
    const openaiProvider = providers.find((p) => p.id === "openai");

    expect(openaiProvider).toBeDefined();
    expect(openaiProvider!.models.length).toBeGreaterThan(60);

    // Check for some known models
    const modelIds = openaiProvider!.models.map((m) => m.id);
    expect(modelIds).toContain("gpt-5.2");
    expect(modelIds).toContain("gpt-4o");
    expect(modelIds).toContain("o3");
    expect(modelIds).toContain("o1");
  });

  it("should include Google Gemini models", () => {
    const providers = providerService.getProviders();
    const googleProvider = providers.find((p) => p.id === "google");

    expect(googleProvider).toBeDefined();
    expect(googleProvider!.models).toEqual([
      { id: "gemini-flash-lite-latest", name: "Gemini Flash Lite (Latest)" },
      { id: "gemini-flash-latest", name: "Gemini Flash (Latest)" },
      { id: "gemini-3-pro-preview", name: "Gemini 3.0 Pro (Preview)" },
      { id: "gemini-3-flash-preview", name: "Gemini 3.0 Flash (Preview)" },
      { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash (Experimental)" },
      { id: "gemini-exp-1206", name: "Gemini Experimental 1206" },
      { id: "gemini-2.0-flash-thinking-exp-1219", name: "Gemini 2.0 Flash Thinking" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
      { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
      { id: "gemini-1.5-flash-8b", name: "Gemini 1.5 Flash 8B" },
    ]);
  });

  it("should format model names correctly", () => {
    const providers = providerService.getProviders();
    const openaiProvider = providers.find((p) => p.id === "openai");

    const gpt52Model = openaiProvider!.models.find((m) => m.id === "gpt-5.2");
    expect(gpt52Model?.name).toBe("GPT-5.2");

    const datedModel = openaiProvider!.models.find((m) => m.id === "gpt-5.2-2025-12-11");
    expect(datedModel?.name).toBe("GPT-5.2 (2025-12-11)");
  });
});
