import { describe, expect, it } from "vitest";
import {
  DEFAULT_OPENROUTER_SETTINGS,
  parseOpenRouterSettings,
  toOpenRouterSettingsBody,
} from "../../../src/lib/openrouter-settings";

describe("parseOpenRouterSettings", () => {
  it("reads the reasoning effort and provider sort from a saved prompt body", () => {
    expect(
      parseOpenRouterSettings({ openrouter_settings: { reasoning_effort: "low", provider_sort: "throughput" } })
    ).toEqual({ ...DEFAULT_OPENROUTER_SETTINGS, reasoningEffort: "low", providerSort: "throughput" });
  });

  it("reads temperature, including 0, and max tokens", () => {
    expect(
      parseOpenRouterSettings({ openrouter_settings: { temperature: 0, max_tokens: 1500 } })
    ).toEqual({ ...DEFAULT_OPENROUTER_SETTINGS, temperature: 0, maxTokens: 1500 });
  });

  it("uses the defaults when the body has no openrouter settings", () => {
    expect(parseOpenRouterSettings({ messages: [] })).toEqual(DEFAULT_OPENROUTER_SETTINGS);
    expect(parseOpenRouterSettings(null)).toEqual(DEFAULT_OPENROUTER_SETTINGS);
  });

  it("ignores unknown values", () => {
    expect(
      parseOpenRouterSettings({
        openrouter_settings: { reasoning_effort: "turbo", provider_sort: 5, temperature: "hot", max_tokens: -3 },
      })
    ).toEqual(DEFAULT_OPENROUTER_SETTINGS);
  });
});

describe("toOpenRouterSettingsBody", () => {
  it("returns only the values that differ from the default", () => {
    expect(toOpenRouterSettingsBody({ ...DEFAULT_OPENROUTER_SETTINGS, reasoningEffort: "none" })).toEqual({
      reasoning_effort: "none",
    });
    expect(toOpenRouterSettingsBody({ ...DEFAULT_OPENROUTER_SETTINGS, providerSort: "latency" })).toEqual({
      provider_sort: "latency",
    });
    expect(toOpenRouterSettingsBody({ ...DEFAULT_OPENROUTER_SETTINGS, temperature: 0, maxTokens: 800 })).toEqual({
      temperature: 0,
      max_tokens: 800,
    });
  });

  it("returns undefined when every value is the default", () => {
    expect(toOpenRouterSettingsBody(DEFAULT_OPENROUTER_SETTINGS)).toBeUndefined();
  });
});
