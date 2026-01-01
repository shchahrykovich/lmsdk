import { describe, it, expect, beforeEach } from "vitest";
import { ProviderService } from "../../../../worker/services/provider.service";

describe("ProviderService - getSupportedProviderNames", () => {
  let providerService: ProviderService;

  beforeEach(() => {
    providerService = new ProviderService();
  });

  it("should return array of supported provider names", () => {
    const providerNames = providerService.getSupportedProviderNames();

    expect(providerNames).toEqual(["openai", "google"]);
  });
});
