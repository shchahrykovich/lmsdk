import { describe, it, expect } from "vitest";
import { billableTokens, computeCost, findModelPrice } from "../../../worker/pricing/cost";
import type { PriceTable } from "../../../worker/pricing/price-table";

describe("computeCost", () => {
  it("prices OpenAI cached input at the cached rate and the rest at the input rate", () => {
    const cost = computeCost({
      provider: "openai",
      model: "gpt-5",
      tier: "standard",
      usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000, total_tokens: 2_000_000, cached_tokens: 400_000 },
    });

    expect(cost).toBeCloseTo(0.6 * 1.25 + 0.4 * 0.125 + 10, 9);
  });

  it("uses the batch prices, which are half of the standard prices for gpt-6-luna", () => {
    const usage = { prompt_tokens: 3_000, completion_tokens: 500, total_tokens: 3_500 };

    const standard = computeCost({ provider: "openai", model: "gpt-6-luna", tier: "standard", usage });
    const batch = computeCost({ provider: "openai", model: "gpt-6-luna", tier: "batch", usage });

    expect(standard).toBeCloseTo((3_000 * 0.1 + 500 * 0.5) / 1e6, 12);
    expect(batch).toBeCloseTo(standard! / 2, 12);
  });

  it("falls back to the input price when the batch tier lists no cached input price", () => {
    const cost = computeCost({
      provider: "openai",
      model: "gpt-4o",
      tier: "batch",
      usage: { prompt_tokens: 1_000_000, completion_tokens: 0, total_tokens: 1_000_000, cached_tokens: 1_000_000 },
    });

    expect(cost).toBeCloseTo(1.25, 9);
  });

  it("uses the long-context prices when the prompt is above the threshold", () => {
    const usage = { prompt_tokens: 300_000, completion_tokens: 0, total_tokens: 300_000 };

    const cost = computeCost({ provider: "openai", model: "gpt-6-sol", tier: "standard", usage });

    expect(cost).toBeCloseTo(0.3 * 4, 9);
  });

  it("bills Google thinking tokens as output and cached content at the caching price", () => {
    const cost = computeCost({
      provider: "google",
      model: "gemini-2.5-flash",
      tier: "batch",
      usage: {
        prompt_tokens: 1_000_000,
        completion_tokens: 200_000,
        total_tokens: 1_500_000,
        thoughts_tokens: 300_000,
        cached_content_tokens: 500_000,
      },
    });

    expect(cost).toBeCloseTo(0.5 * 0.15 + 0.5 * 0.03 + 0.5 * 1.25, 9);
  });

  it("separates Anthropic cache reads and cache writes from plain input", () => {
    const cost = computeCost({
      provider: "anthropic",
      model: "claude-haiku-4-5",
      tier: "standard",
      usage: {
        prompt_tokens: 1_000_000,
        completion_tokens: 0,
        total_tokens: 1_000_000,
        cached_tokens: 500_000,
        cache_creation_tokens: 100_000,
      },
    });

    expect(cost).toBeCloseTo(0.4 * 1 + 0.5 * 0.1 + 0.1 * 1.25, 9);
  });

  it("returns undefined for a model that is not in the price table", () => {
    const usage = { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 };

    expect(computeCost({ provider: "openai", model: "gpt-unknown", tier: "standard", usage })).toBeUndefined();
    expect(computeCost({ provider: "google", model: "gemini-flash-latest", tier: "batch", usage })).toBeUndefined();
  });

  it("prices a dated OpenAI snapshot with the price of its base model", () => {
    expect(findModelPrice("openai", "gpt-5-mini-2025-08-07")).toBe(findModelPrice("openai", "gpt-5-mini"));
  });
});

describe("findModelPrice", () => {
  const table: PriceTable = {
    google: {
      flash: [
        { standard: { input: 1, cachedInput: null, output: 2 }, batch: null },
        { effectiveFrom: "2027-01-01", standard: { input: 3, cachedInput: null, output: 4 }, batch: null },
      ],
    },
  };

  it("picks the price that is in effect on the given day", () => {
    expect(findModelPrice("google", "flash", new Date("2026-12-31T23:00:00Z"), table)?.standard.input).toBe(1);
    expect(findModelPrice("google", "flash", new Date("2027-01-01T00:00:00Z"), table)?.standard.input).toBe(3);
  });
});

describe("billableTokens", () => {
  it("adds the Google tool-use prompt tokens to the input", () => {
    const tokens = billableTokens("google", {
      prompt_tokens: 100,
      completion_tokens: 10,
      total_tokens: 130,
      tool_use_prompt_tokens: 20,
    });

    expect(tokens).toEqual({ input: 120, cachedInput: 0, cacheWrite: 0, output: 10 });
  });
});
