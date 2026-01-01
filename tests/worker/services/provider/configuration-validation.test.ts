import { describe, it, expect, beforeEach } from "vitest";
import { ProviderService } from "../../../../worker/services/provider.service";
import {NullPromptExecutionLogger} from "../../../../worker/providers/execution-logger";

describe("ProviderService - Configuration validation", () => {
  it("should create service with valid config", () => {
    const logger = new NullPromptExecutionLogger();
    const service = new ProviderService({
      openAIKey: "test-key",
      geminiKey: "test-key",
    }, logger);

    expect(service).toBeDefined();
    expect(service.getSupportedProviderNames()).toEqual(["openai", "google"]);
  });

  it("should create service with partial config", () => {
    const logger = new NullPromptExecutionLogger();
    const serviceWithOpenAI = new ProviderService({
      openAIKey: "test-key",
    }, logger);

    expect(serviceWithOpenAI).toBeDefined();

    const serviceWithGemini = new ProviderService({
      geminiKey: "test-key",
    }, logger);

    expect(serviceWithGemini).toBeDefined();
  });
});
