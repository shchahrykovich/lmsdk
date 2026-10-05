import type { OpenRouterModel } from "./openrouter-models";

const OPENROUTER_DECISION_MODELS: readonly OpenRouterModel[] = [
  { id: "typesafe/jev-1.13", name: "Jev 1.13" },
  { id: "~typesafe/jev-latest", name: "Jev (Latest)" },
];

export function getOpenRouterDecisionModels(): OpenRouterModel[] {
  return OPENROUTER_DECISION_MODELS.map((model) => ({ ...model }));
}
