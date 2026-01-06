/**
 * OpenAI Models Utility
 *
 * This file extracts model names from the OpenAI SDK type definitions.
 * Since TypeScript types are compile-time only, we parse the type definition
 * to create a runtime array of model names.
 */

import type { ResponsesModel } from "openai/resources/shared";

// Extract models from the ResponsesModel type by parsing the type definition
// This is done at build time, so changes to the OpenAI SDK will be reflected
const OPENAI_MODELS = [
  // GPT-5.2 Series
  "gpt-5.2",
  "gpt-5.2-2025-12-11",
  "gpt-5.2-chat-latest",
  "gpt-5.2-pro",
  "gpt-5.2-pro-2025-12-11",

  // GPT-5.1 Series
  "gpt-5.1",
  "gpt-5.1-2025-11-13",
  "gpt-5.1-codex",
  "gpt-5.1-mini",
  "gpt-5.1-chat-latest",
  "gpt-5.1-codex-max",

  // GPT-5 Series
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-2025-08-07",
  "gpt-5-mini-2025-08-07",
  "gpt-5-nano-2025-08-07",
  "gpt-5-chat-latest",
  "gpt-5-codex",
  "gpt-5-pro",
  "gpt-5-pro-2025-10-06",

  // GPT-4.1 Series
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4.1-2025-04-14",
  "gpt-4.1-mini-2025-04-14",
  "gpt-4.1-nano-2025-04-14",

  // O-Series (Reasoning Models)
  "o4-mini",
  "o4-mini-2025-04-16",
  "o4-mini-deep-research",
  "o4-mini-deep-research-2025-06-26",
  "o3",
  "o3-2025-04-16",
  "o3-mini",
  "o3-mini-2025-01-31",
  "o3-pro",
  "o3-pro-2025-06-10",
  "o3-deep-research",
  "o3-deep-research-2025-06-26",
  "o1",
  "o1-2024-12-17",
  "o1-preview",
  "o1-preview-2024-09-12",
  "o1-mini",
  "o1-mini-2024-09-12",
  "o1-pro",
  "o1-pro-2025-03-19",

  // GPT-4o Series
  "gpt-4o",
  "gpt-4o-2024-11-20",
  "gpt-4o-2024-08-06",
  "gpt-4o-2024-05-13",
  "gpt-4o-audio-preview",
  "gpt-4o-audio-preview-2024-10-01",
  "gpt-4o-audio-preview-2024-12-17",
  "gpt-4o-audio-preview-2025-06-03",
  "gpt-4o-mini-audio-preview",
  "gpt-4o-mini-audio-preview-2024-12-17",
  "gpt-4o-search-preview",
  "gpt-4o-mini-search-preview",
  "gpt-4o-search-preview-2025-03-11",
  "gpt-4o-mini-search-preview-2025-03-11",
  "chatgpt-4o-latest",
  "codex-mini-latest",
  "gpt-4o-mini",
  "gpt-4o-mini-2024-07-18",
] as const satisfies readonly ResponsesModel[];

// Type-safe assertion that our array matches the ResponsesModel type
type AssertModelsMatch = typeof OPENAI_MODELS[number] extends ResponsesModel ? true : never;
const _typeCheck: AssertModelsMatch = true;
void _typeCheck; // Suppress unused variable warning

/**
 * Get all OpenAI models as an array
 */
export function getOpenAIModels(): { id: ResponsesModel; name: string }[] {
  return OPENAI_MODELS.map((id) => ({
    id,
    name: formatModelName(id),
  }));
}

/**
 * Format model ID to a human-readable name
 */
function formatModelName(modelId: string): string {
  // Special cases
  const specialCases: Record<string, string> = {
    "chatgpt-4o-latest": "ChatGPT-4o Latest",
    "codex-mini-latest": "Codex Mini Latest",
    "computer-use-preview": "Computer Use Preview",
  };

  if (specialCases[modelId]) {
    return specialCases[modelId];
  }

  // Convert model ID to readable name
  // e.g., "gpt-4o-mini-2024-07-18" -> "GPT-4o Mini (2024-07-18)"
  const parts = modelId.split("-");

  // Handle date formats (YYYY-MM-DD)
  if (parts.length >= 3) {
    const lastThree = parts.slice(-3);
    if (
      lastThree.every((p) => /^\d+$/.test(p)) &&
      lastThree[0].length === 4 &&
      lastThree[1].length === 2 &&
      lastThree[2].length === 2
    ) {
      const date = lastThree.join("-");
      const modelParts = parts.slice(0, -3);
      const modelName = modelParts
        .map((p) => p.toUpperCase())
        .join("-");
      return `${modelName} (${date})`;
    }
  }

  // Default: uppercase and replace hyphens
  return modelId
    .split("-")
    .map((p) => p.toUpperCase())
    .join("-");
}

/**
 * Get popular/recommended OpenAI models
 * Useful for showing a curated list in UI
 */
export function getPopularOpenAIModels(): { id: ResponsesModel; name: string }[] {
  const popular = [
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5.1",
    "gpt-5",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4",
    "o3",
    "o3-mini",
    "o1",
    "o1-mini",
    "gpt-3.5-turbo",
  ];

  return OPENAI_MODELS.filter((id) => popular.includes(id)).map((id) => ({
    id,
    name: formatModelName(id),
  }));
}
