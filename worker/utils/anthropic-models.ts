export interface AnthropicModel {
  id: string;
  name: string;
}

const ANTHROPIC_MODELS: readonly AnthropicModel[] = [
  { id: "claude-opus-5-5", name: "Claude Opus 5.5" },
  { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5" },
  { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
  { id: "claude-fable-5-1", name: "Claude Fable 5.1" },
  { id: "claude-opus-5", name: "Claude Opus 5" },
  { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
];

export function getAnthropicModels(): AnthropicModel[] {
  return ANTHROPIC_MODELS.map((model) => ({ ...model }));
}
