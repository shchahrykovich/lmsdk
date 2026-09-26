export const openRouterCompletion = (model = "anthropic/claude-sonnet-5") => ({
  id: "gen-1",
  object: "chat.completion",
  model,
  choices: [
    {
      index: 0,
      finish_reason: "stop",
      message: { role: "assistant", content: "Hello from OpenRouter" },
    },
  ],
  usage: {
    prompt_tokens: 120,
    completion_tokens: 80,
    total_tokens: 200,
    cost: 0.0012,
    prompt_tokens_details: { cached_tokens: 40 },
    completion_tokens_details: { reasoning_tokens: 30 },
  },
});

export const openRouterErrorBody = { error: { code: 502, message: "upstream failed" } };
