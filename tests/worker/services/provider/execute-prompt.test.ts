import { describe, it, expect, beforeEach } from "vitest";
import { ProviderService } from "../../../../worker/services/provider.service";
import {ExecuteRequest} from "../../../../worker/providers/base-provider";

describe("ProviderService - executePrompt", () => {
  let providerService: ProviderService;

  beforeEach(() => {
    providerService = new ProviderService();
  });

  it("should throw error when provider is not supported", async () => {
    const request: ExecuteRequest = {
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
    };

    await expect(
      providerService.executePrompt("unsupported", request)
    ).rejects.toThrow("Provider 'unsupported' is not supported");
  });
});
