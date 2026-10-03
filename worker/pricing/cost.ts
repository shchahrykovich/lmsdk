import type { TokenUsage } from "../providers/base-provider";
import { PRICE_TABLE, type ModelPrice, type PriceTable, type TokenPrices } from "./price-table";

export type PriceTier = "standard" | "batch";

export interface BillableTokens {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
}

const PER_MILLION = 1_000_000;

export function billableTokens(provider: string, usage: TokenUsage): BillableTokens {
  const cachedInput = usage.cached_tokens ?? usage.cached_content_tokens ?? 0;
  const cacheWrite = usage.cache_creation_tokens ?? 0;
  const promptTokens = usage.prompt_tokens + (provider === "google" ? (usage.tool_use_prompt_tokens ?? 0) : 0);
  const output = usage.completion_tokens + (provider === "google" ? (usage.thoughts_tokens ?? 0) : 0);
  return {
    input: Math.max(0, promptTokens - cachedInput - cacheWrite),
    cachedInput,
    cacheWrite,
    output,
  };
}

export function findModelPrice(
  provider: string,
  model: string,
  at: Date = new Date(),
  table: PriceTable = PRICE_TABLE
): ModelPrice | undefined {
  const models = table[provider];
  const entries = models?.[model] ?? models?.[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
  if (!entries) return undefined;
  const day = at.toISOString().slice(0, 10);
  return entries
    .filter((entry) => !entry.effectiveFrom || entry.effectiveFrom <= day)
    .sort((a, b) => (a.effectiveFrom ?? "").localeCompare(b.effectiveFrom ?? ""))
    .at(-1);
}

const pricesFor = (price: ModelPrice, tier: PriceTier, promptTokens: number): TokenPrices | undefined => {
  const selected = tier === "batch" ? price.batch : price.standard;
  if (!selected) return undefined;
  const long = selected.longContext;
  return long && promptTokens > long.thresholdTokens ? long : selected;
};

const roundUsd = (value: number): number => Math.round(value * 1e9) / 1e9;

export function computeCost(params: {
  provider: string;
  model: string;
  usage: TokenUsage;
  tier: PriceTier;
  at?: Date;
  table?: PriceTable;
}): number | undefined {
  const price = findModelPrice(params.provider, params.model, params.at, params.table);
  if (!price) return undefined;
  const tokens = billableTokens(params.provider, params.usage);
  const promptTokens = tokens.input + tokens.cachedInput + tokens.cacheWrite;
  const prices = pricesFor(price, params.tier, promptTokens);
  if (!prices) return undefined;
  const total =
    tokens.input * prices.input +
    tokens.cachedInput * (prices.cachedInput ?? prices.input) +
    tokens.cacheWrite * (prices.cacheWrite ?? prices.input) +
    tokens.output * prices.output;
  return roundUsd(total / PER_MILLION);
}

export function withCost(provider: string, model: string, usage: TokenUsage, tier: PriceTier): TokenUsage {
  if (usage.cost !== undefined) return usage;
  const cost = computeCost({ provider, model, usage, tier });
  return cost === undefined ? usage : { ...usage, cost };
}
