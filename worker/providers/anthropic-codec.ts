import type Anthropic from "@anthropic-ai/sdk";
import type { ExecuteRequest, ExecuteResult, TokenUsage } from "./base-provider";
import { withCost, type PriceTier } from "../pricing/cost";

export const ANTHROPIC_DEFAULT_MAX_TOKENS = 16_000;

export type AnthropicRequest = Anthropic.MessageCreateParamsNonStreaming;

export class AnthropicRefusalError extends Error {
  constructor(category: string | null | undefined) {
    const detail = category ? `, category "${category}"` : "";
    super(`Anthropic declined the request (stop_reason "refusal"${detail})`);
    this.name = "AnthropicRefusalError";
  }
}

const splitSystem = (messages: ExecuteRequest["messages"]) => {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const turns: Anthropic.MessageParam[] = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
  if (turns.length === 0 && system) {
    return { system: "", turns: [{ role: "user" as const, content: system }] };
  }
  return { system, turns };
};

const buildOutputConfig = (request: ExecuteRequest): Anthropic.OutputConfig | undefined => {
  const outputConfig: Anthropic.OutputConfig = {};
  const effort = request.anthropic_settings?.effort;
  if (effort) {
    outputConfig.effort = effort;
  }
  const responseFormat = request.response_format;
  if (responseFormat?.type === "json_schema" && responseFormat.json_schema) {
    const schema = (responseFormat.json_schema.schema ?? responseFormat.json_schema) as Record<string, unknown>;
    outputConfig.format = { type: "json_schema", schema };
  }
  return Object.keys(outputConfig).length > 0 ? outputConfig : undefined;
};

export function buildAnthropicRequest(request: ExecuteRequest): AnthropicRequest {
  const { system, turns } = splitSystem(request.messages);
  const outputConfig = buildOutputConfig(request);
  return {
    model: request.model,
    max_tokens: request.anthropic_settings?.max_tokens ?? ANTHROPIC_DEFAULT_MAX_TOKENS,
    ...(system ? { system } : {}),
    messages: turns,
    ...(outputConfig ? { output_config: outputConfig } : {}),
  };
}

export function anthropicUsage(usage: Anthropic.Usage | undefined): TokenUsage {
  const cacheRead = usage?.cache_read_input_tokens ?? 0;
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0;
  const promptTokens = (usage?.input_tokens ?? 0) + cacheRead + cacheWrite;
  const completionTokens = usage?.output_tokens ?? 0;
  return {
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: promptTokens + completionTokens,
    ...(cacheRead > 0 ? { cached_tokens: cacheRead } : {}),
    ...(cacheWrite > 0 ? { cache_creation_tokens: cacheWrite } : {}),
  };
}

export function anthropicResult(params: {
  requestedModel: string;
  message: Pick<Anthropic.Message, "content" | "model" | "usage" | "stop_reason"> & {
    stop_details?: { category?: string | null } | null;
  };
  durationMs?: number;
  tier: PriceTier;
}): ExecuteResult {
  const { requestedModel, message, durationMs, tier } = params;
  if (message.stop_reason === "refusal") {
    throw new AnthropicRefusalError(message.stop_details?.category);
  }
  const content = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
  return {
    content,
    model: message.model ?? requestedModel,
    usage: withCost("anthropic", requestedModel, anthropicUsage(message.usage), tier),
    ...(durationMs === undefined ? {} : { duration_ms: durationMs }),
  };
}
