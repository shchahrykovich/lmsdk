export const OPENROUTER_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high"] as const;
export const OPENROUTER_PROVIDER_SORTS = ["throughput", "latency", "price"] as const;

export type OpenRouterReasoningEffort = (typeof OPENROUTER_REASONING_EFFORTS)[number] | "default";
export type OpenRouterProviderSort = (typeof OPENROUTER_PROVIDER_SORTS)[number] | "default";

export const MAX_TEMPERATURE = 2;

export interface OpenRouterSettingsState {
  reasoningEffort: OpenRouterReasoningEffort;
  providerSort: OpenRouterProviderSort;
  temperature?: number;
  maxTokens?: number;
}

export interface OpenRouterSettingsBody {
  reasoning_effort?: (typeof OPENROUTER_REASONING_EFFORTS)[number];
  provider_sort?: (typeof OPENROUTER_PROVIDER_SORTS)[number];
  temperature?: number;
  max_tokens?: number;
}

export const DEFAULT_OPENROUTER_SETTINGS: OpenRouterSettingsState = {
  reasoningEffort: "default",
  providerSort: "default",
};

export const isValidTemperature = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= MAX_TEMPERATURE;

export const isValidMaxTokens = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value > 0;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const pickAllowed = <T extends string>(allowed: readonly T[], value: unknown): T | undefined =>
  allowed.find((item) => item === value);

export function parseOpenRouterSettings(parsedBody: unknown): OpenRouterSettingsState {
  if (!isRecord(parsedBody) || !isRecord(parsedBody.openrouter_settings)) {
    return DEFAULT_OPENROUTER_SETTINGS;
  }

  const settings = parsedBody.openrouter_settings;
  const state: OpenRouterSettingsState = {
    reasoningEffort: pickAllowed(OPENROUTER_REASONING_EFFORTS, settings.reasoning_effort) ?? "default",
    providerSort: pickAllowed(OPENROUTER_PROVIDER_SORTS, settings.provider_sort) ?? "default",
  };
  if (isValidTemperature(settings.temperature)) {
    state.temperature = settings.temperature;
  }
  if (isValidMaxTokens(settings.max_tokens)) {
    state.maxTokens = settings.max_tokens;
  }
  return state;
}

export function toOpenRouterSettingsBody(state: OpenRouterSettingsState): OpenRouterSettingsBody | undefined {
  const body: OpenRouterSettingsBody = {};
  if (state.reasoningEffort !== "default") {
    body.reasoning_effort = state.reasoningEffort;
  }
  if (state.providerSort !== "default") {
    body.provider_sort = state.providerSort;
  }
  if (state.temperature !== undefined) {
    body.temperature = state.temperature;
  }
  if (state.maxTokens !== undefined) {
    body.max_tokens = state.maxTokens;
  }
  return Object.keys(body).length > 0 ? body : undefined;
}
