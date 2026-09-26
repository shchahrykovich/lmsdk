export interface OpenRouterModel {
  id: string;
  name: string;
}

const OPENROUTER_MODELS: readonly OpenRouterModel[] = [
  { id: "anthropic/claude-opus-5.5", name: "Anthropic: Claude Opus 5.5" },
  { id: "anthropic/claude-sonnet-5", name: "Anthropic: Claude Sonnet 5" },
  { id: "anthropic/claude-haiku-4.5", name: "Anthropic: Claude Haiku 4.5" },
  { id: "anthropic/claude-fable-5.1", name: "Anthropic: Claude Fable 5.1" },
  { id: "x-ai/grok-4.7", name: "SpaceXAI: Grok 4.7" },
  { id: "deepseek/deepseek-v4-pro", name: "DeepSeek: DeepSeek V4 Pro 0423" },
  { id: "deepseek/deepseek-v4.1-flash", name: "DeepSeek: DeepSeek V4.1 Flash" },
  { id: "qwen/qwen3.8-max-prime", name: "Qwen: Qwen3.8 Max Prime" },
  { id: "qwen/qwen3.8-flash", name: "Qwen: Qwen3.8 Flash" },
  { id: "moonshotai/kimi-k3", name: "MoonshotAI: Kimi K3" },
  { id: "mistralai/mistral-medium-3-5", name: "Mistral: Mistral Medium 3.5" },
  { id: "z-ai/glm-5.3", name: "Z.ai: GLM 5.3" },
  { id: "meta-llama/llama-4-maverick", name: "Meta: Llama 4 Maverick" },
];

export function getOpenRouterModels(): OpenRouterModel[] {
  return OPENROUTER_MODELS.map((model) => ({ ...model }));
}
