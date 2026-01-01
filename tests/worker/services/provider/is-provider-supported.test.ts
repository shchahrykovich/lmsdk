import { describe, it, expect, beforeEach } from "vitest";
import { ProviderService } from "../../../../worker/services/provider.service";

describe("ProviderService - isProviderSupported", () => {
  let providerService: ProviderService;

  beforeEach(() => {
    providerService = new ProviderService();
  });

  it("should return true for supported providers", () => {
    expect(providerService.isProviderSupported("openai")).toBe(true);
    expect(providerService.isProviderSupported("google")).toBe(true);
  });

  it("should return true for case-insensitive provider names", () => {
    expect(providerService.isProviderSupported("OpenAI")).toBe(true);
    expect(providerService.isProviderSupported("GOOGLE")).toBe(true);
  });

  it("should return false for unsupported providers", () => {
    expect(providerService.isProviderSupported("anthropic")).toBe(false);
    expect(providerService.isProviderSupported("cohere")).toBe(false);
    expect(providerService.isProviderSupported("")).toBe(false);
  });
});
