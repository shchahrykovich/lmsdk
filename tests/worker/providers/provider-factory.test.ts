import { describe, it, expect, beforeEach } from "vitest";
import { ProviderFactory } from "../../../worker/providers/provider-factory";
import { OpenAIProvider } from "../../../worker/providers/openai-provider";
import { GoogleProvider } from "../../../worker/providers/google-provider";
import { NullPromptExecutionLogger } from "../../../worker/providers/execution-logger";

describe("ProviderFactory", () => {
  let logger: NullPromptExecutionLogger;

  beforeEach(() => {
    logger = new NullPromptExecutionLogger();
  });
  describe("createProvider", () => {
    it("should create OpenAI provider with valid API key", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "test-openai-key",
      }, logger);

      const provider = factory.createProvider("openai");

      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.getProviderName()).toBe("openai");
    });

    it("should create OpenAI provider with case-insensitive name", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "test-openai-key",
        
        
      }, logger);

      const provider1 = factory.createProvider("OpenAI");
      const provider2 = factory.createProvider("OPENAI");
      const provider3 = factory.createProvider("openai");

      expect(provider1).toBeInstanceOf(OpenAIProvider);
      expect(provider2).toBeInstanceOf(OpenAIProvider);
      expect(provider3).toBeInstanceOf(OpenAIProvider);
    });

    it("should create Google provider with valid API key", () => {
      
      
      const factory = new ProviderFactory({
        geminiKey: "test-gemini-key",
        
        
      }, logger);

      const provider = factory.createProvider("google");

      expect(provider).toBeInstanceOf(GoogleProvider);
      expect(provider.getProviderName()).toBe("google");
    });

    it("should create Google provider with case-insensitive name", () => {
      
      
      const factory = new ProviderFactory({
        geminiKey: "test-gemini-key",
        
        
      }, logger);

      const provider1 = factory.createProvider("Google");
      const provider2 = factory.createProvider("GOOGLE");
      const provider3 = factory.createProvider("google");

      expect(provider1).toBeInstanceOf(GoogleProvider);
      expect(provider2).toBeInstanceOf(GoogleProvider);
      expect(provider3).toBeInstanceOf(GoogleProvider);
    });

    it("should throw error when OpenAI API key is missing", () => {
      
      
      const factory = new ProviderFactory({
        geminiKey: "test-gemini-key",
        
        
      }, logger);

      expect(() => factory.createProvider("openai")).toThrow(
        "OpenAI API key not configured. Please set OPEN_AI_API_KEY secret."
      );
    });

    it("should throw error when Google API key is missing", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "test-openai-key",
        
        
      }, logger);

      expect(() => factory.createProvider("google")).toThrow(
        "Google Gemini API key not configured. Please set GEMINI_API_KEY secret."
      );
    });

    it("should throw error for unsupported provider", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "test-openai-key",
        geminiKey: "test-gemini-key",
        
        
      }, logger);

      expect(() => factory.createProvider("anthropic")).toThrow(
        "Provider 'anthropic' is not supported. Supported providers: openai, google"
      );
    });

    it("should throw error for empty provider name", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "test-openai-key",
        
        
      }, logger);

      expect(() => factory.createProvider("")).toThrow(
        "Provider '' is not supported. Supported providers: openai, google"
      );
    });

    it("should create different provider instances on each call", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "test-openai-key",
        
        
      }, logger);

      const provider1 = factory.createProvider("openai");
      const provider2 = factory.createProvider("openai");

      expect(provider1).not.toBe(provider2);
      expect(provider1).toBeInstanceOf(OpenAIProvider);
      expect(provider2).toBeInstanceOf(OpenAIProvider);
    });
  });

  describe("isProviderSupported", () => {
    it("should return true for supported providers", () => {
      
      
      const factory = new ProviderFactory({
        
        
      }, logger);

      expect(factory.isProviderSupported("openai")).toBe(true);
      expect(factory.isProviderSupported("google")).toBe(true);
    });

    it("should be case-insensitive", () => {
      
      
      const factory = new ProviderFactory({
        
        
      }, logger);

      expect(factory.isProviderSupported("OpenAI")).toBe(true);
      expect(factory.isProviderSupported("GOOGLE")).toBe(true);
      expect(factory.isProviderSupported("Google")).toBe(true);
    });

    it("should return false for unsupported providers", () => {
      
      
      const factory = new ProviderFactory({
        
        
      }, logger);

      expect(factory.isProviderSupported("anthropic")).toBe(false);
      expect(factory.isProviderSupported("cohere")).toBe(false);
      expect(factory.isProviderSupported("")).toBe(false);
      expect(factory.isProviderSupported("unknown")).toBe(false);
    });
  });

  describe("getSupportedProviders", () => {
    it("should return list of supported provider names", () => {
      
      
      const factory = new ProviderFactory({
        
        
      }, logger);

      const providers = factory.getSupportedProviders();

      expect(providers).toEqual(["openai", "google"]);
    });

    it("should return same list regardless of config", () => {
      
      
      const factory1 = new ProviderFactory({
        openAIKey: "test-key",
        
        
      }, logger);

      const factory2 = new ProviderFactory({
        geminiKey: "test-key",
        
        
      }, logger);

      const factory3 = new ProviderFactory({
        
        
      }, logger);

      expect(factory1.getSupportedProviders()).toEqual(["openai", "google"]);
      expect(factory2.getSupportedProviders()).toEqual(["openai", "google"]);
      expect(factory3.getSupportedProviders()).toEqual(["openai", "google"]);
    });
  });

  describe("Configuration edge cases", () => {
    it("should handle empty config object", () => {
      
      
      const factory = new ProviderFactory({
        
        
      }, logger);

      expect(factory).toBeDefined();
      expect(factory.getSupportedProviders()).toEqual(["openai", "google"]);
    });

    it("should handle undefined API keys in config", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: undefined,
        geminiKey: undefined,
        
        
      }, logger);

      expect(() => factory.createProvider("openai")).toThrow(
        "OpenAI API key not configured"
      );
      expect(() => factory.createProvider("google")).toThrow(
        "Google Gemini API key not configured"
      );
    });

    it("should handle empty string API keys", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "",
        geminiKey: "",
        
        
      }, logger);

      // Empty string API keys should be caught by the provider constructors
      expect(() => factory.createProvider("openai")).toThrow();
      expect(() => factory.createProvider("google")).toThrow();
    });

    it("should allow both providers with both keys configured", () => {
      
      
      const factory = new ProviderFactory({
        openAIKey: "test-openai-key",
        geminiKey: "test-gemini-key",
        
        
      }, logger);

      const openaiProvider = factory.createProvider("openai");
      const googleProvider = factory.createProvider("google");

      expect(openaiProvider).toBeInstanceOf(OpenAIProvider);
      expect(googleProvider).toBeInstanceOf(GoogleProvider);
    });
  });
});
