import { describe, it, expect } from "vitest";
import { providerConfigFromEnv } from "../../../worker/providers/provider-factory";

describe("providerConfigFromEnv", () => {
  it("maps every provider secret and the gateway settings from env", () => {
    const env = {
      OPEN_AI_API_KEY: "openai-key",
      GEMINI_API_KEY: "gemini-key",
      OPENROUTER_API_KEY: "openrouter-key",
      CLOUDFLARE_AI_GATEWAY_TOKEN: "gateway-token",
      CLOUDFLARE_AI_GATEWAY_BASE_URL: "https://gateway.example",
    } as Env;

    expect(providerConfigFromEnv(env)).toEqual({
      openAIKey: "openai-key",
      geminiKey: "gemini-key",
      openRouterKey: "openrouter-key",
      cloudflareAiGatewayToken: "gateway-token",
      cloudflareAiGatewayBaseUrl: "https://gateway.example",
    });
  });

  it("leaves a missing secret undefined so the factory reports it", () => {
    const env = { OPEN_AI_API_KEY: "openai-key" } as Env;

    expect(providerConfigFromEnv(env).openRouterKey).toBeUndefined();
  });
});
