import { describe, it, expect, beforeEach } from "vitest";
import { ProviderService } from "../../../../worker/services/provider.service";

describe("ProviderService - getProviders", () => {
  let providerService: ProviderService;

  beforeEach(() => {
    providerService = new ProviderService();
  });

  it("should return list of available providers", () => {
    const providers = providerService.getProviders();

    expect(providers).toHaveLength(5);
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
    expect(providers[2]).toEqual({
      id: "openrouter",
      name: "OpenRouter",
      description: expect.any(String),
      models: expect.any(Array),
    });
    expect(providers[3]).toEqual({
      id: "anthropic",
      name: "Anthropic",
      description: expect.any(String),
      models: expect.any(Array),
    });
  });

  it("offers the Jev decision models under OpenRouter Decisions", () => {
    const decisions = providerService.getProviders().find((p) => p.id === "openrouter-decisions");

    expect(decisions).toEqual({
      id: "openrouter-decisions",
      name: "OpenRouter Decisions",
      description: expect.any(String),
      models: [
        { id: "typesafe/jev-1.13", name: "Jev 1.13" },
        { id: "~typesafe/jev-latest", name: "Jev (Latest)" },
      ],
    });
  });

  it("offers the Anthropic models with Claude Opus 5.5 first", () => {
    const anthropic = providerService.getProviders().find((p) => p.id === "anthropic");

    expect(anthropic!.models[0]).toEqual({ id: "claude-opus-5-5", name: "Claude Opus 5.5" });
  });

  it("should offer the curated OpenRouter models in order", () => {
    const openRouter = providerService.getProviders().find((p) => p.id === "openrouter");

    expect(openRouter!.models.map((m) => m.id)).toEqual([
      "anthropic/claude-opus-5.5",
      "anthropic/claude-sonnet-5",
      "anthropic/claude-haiku-4.5",
      "anthropic/claude-fable-5.1",
      "x-ai/grok-4.7",
      "deepseek/deepseek-v4-pro",
      "deepseek/deepseek-v4.1-flash",
      "qwen/qwen3.8-max-prime",
      "qwen/qwen3.8-flash",
      "moonshotai/kimi-k3",
      "mistralai/mistral-medium-3-5",
      "z-ai/glm-5.3",
      "meta-llama/llama-4-maverick",
    ]);
  });

  it("should use vendor/model ids without batch or free suffixes for OpenRouter", () => {
    const openRouter = providerService.getProviders().find((p) => p.id === "openrouter");

    for (const model of openRouter!.models) {
      expect(model.id).toMatch(/^[a-z0-9-]+\/[a-z0-9.-]+$/);
      expect(model.name.length).toBeGreaterThan(0);
    }
  });

  it("should not repeat a model id inside a provider", () => {
    for (const provider of providerService.getProviders()) {
      const ids = provider.models.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
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
      { id: "gemini-pro-latest", name: "Gemini Pro (Latest)" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash" },
      { id: "gemini-3.7-flash", name: "Gemini 3.7 Flash" },
      { id: "gemini-3.6-flash", name: "Gemini 3.6 Flash" },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash" },
      { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite" },
      { id: "gemini-3.1-pro-preview", name: "Gemini 3.1 Pro (Preview)" },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite" },
      { id: "gemini-3-flash-preview", name: "Gemini 3.0 Flash (Preview)" },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    ]);
  });

  it("should not offer Gemini models that the Gemini API has shut down", () => {
    const googleProvider = providerService.getProviders().find((p) => p.id === "google");
    const modelIds = googleProvider!.models.map((m) => m.id);

    for (const retired of [
      "gemini-3-pro-preview",
      "gemini-2.0-flash-exp",
      "gemini-exp-1206",
      "gemini-2.0-flash-thinking-exp-1219",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
    ]) {
      expect(modelIds).not.toContain(retired);
    }
  });

  it("should include the newest OpenAI models", () => {
    const openaiProvider = providerService.getProviders().find((p) => p.id === "openai");
    const modelIds = openaiProvider!.models.map((m) => m.id);

    expect(modelIds).toEqual(
      expect.arrayContaining([
        "gpt-6-astra",
        "gpt-6-sol",
        "gpt-6-luna",
        "gpt-5.6-sol",
        "gpt-5.6-terra",
        "gpt-5.6-luna",
        "gpt-5.5",
        "gpt-5.5-2026-04-23",
        "gpt-5.5-pro",
        "gpt-5.5-pro-2026-04-23",
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.4-nano",
        "gpt-5.4-mini-2026-03-17",
        "gpt-5.4-nano-2026-03-17",
        "gpt-5.3-chat-latest",
      ])
    );
    expect(new Set(modelIds).size).toBe(modelIds.length);
  });

  it("should name the new OpenAI model families readably", () => {
    const openaiProvider = providerService.getProviders().find((p) => p.id === "openai");
    const name = (id: string) => openaiProvider!.models.find((m) => m.id === id)?.name;

    expect(name("gpt-6-sol")).toBe("GPT-6-SOL");
    expect(name("gpt-5.5-pro-2026-04-23")).toBe("GPT-5.5-PRO (2026-04-23)");
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
