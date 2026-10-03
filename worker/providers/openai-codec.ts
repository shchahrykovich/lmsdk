import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseOutputMessage,
  ResponseOutputText,
} from "openai/resources/responses/responses";
import type { ExecuteRequest, ExecuteResult, TokenUsage } from "./base-provider";
import { withCost, type PriceTier } from "../pricing/cost";

type OpenAIReasoningSummary = NonNullable<Reasoning["summary"]>;

export type OpenAIRequest = ResponseCreateParamsNonStreaming;

const toOpenAIReasoningSummary = (
  saved: NonNullable<ExecuteRequest["openai_settings"]>["reasoning_summary"]
): OpenAIReasoningSummary | undefined => {
  if (saved === "disabled") return undefined;
  if (saved === "concise" || saved === "detailed") return saved;
  return "auto";
};

const buildInputMessages = (messages: ExecuteRequest["messages"]) =>
  messages.map((msg) => ({
    role: msg.role === "system" ? "developer" : msg.role,
    content: [{ type: "input_text", text: msg.content }],
  }));

const buildTextFormat = (responseFormat: ExecuteRequest["response_format"]): ResponseTextConfig => {
  if (responseFormat?.type === "json_schema" && responseFormat.json_schema) {
    const schema = responseFormat.json_schema;
    return {
      format: {
        type: "json_schema",
        name: schema.name ?? "response",
        strict: schema.strict ?? true,
        // @ts-expect-error no type
        schema: schema.schema ?? schema,
      },
      verbosity: "medium",
    };
  }
  return { format: { type: "text" }, verbosity: "medium" };
};

const buildReasoningConfig = (openaiSettings: ExecuteRequest["openai_settings"]): Reasoning => {
  const effort = openaiSettings?.reasoning_effort ?? "medium";
  const summary = toOpenAIReasoningSummary(openaiSettings?.reasoning_summary);
  return summary ? { effort, summary } : { effort };
};

const buildIncludeArray = (openaiSettings: ExecuteRequest["openai_settings"]): OpenAIRequest["include"] =>
  openaiSettings?.include_encrypted_reasoning !== false ? ["reasoning.encrypted_content"] : [];

export function buildOpenAIRequest(request: ExecuteRequest): OpenAIRequest {
  return {
    model: request.model,
    input: buildInputMessages(request.messages) as OpenAIRequest["input"],
    text: buildTextFormat(request.response_format),
    reasoning: buildReasoningConfig(request.openai_settings),
    tools: [],
    store: request.openai_settings?.store !== false,
    include: buildIncludeArray(request.openai_settings),
  };
}

export function extractOpenAIOutputText(response: Pick<Response, "output">): string {
  if (!response.output || !Array.isArray(response.output)) {
    return "";
  }
  const messageOutput = response.output.find((item): item is ResponseOutputMessage => item.type === "message");
  const textContent = messageOutput?.content?.find(
    (content): content is ResponseOutputText => content.type === "output_text"
  );
  return textContent?.text ?? "";
}

export function openAIUsage(usage: Response["usage"] | undefined): TokenUsage {
  const inputTokens = usage?.input_tokens ?? 0;
  const outputTokens = usage?.output_tokens ?? 0;
  const details = {
    cached_tokens: usage?.input_tokens_details?.cached_tokens,
    reasoning_tokens: usage?.output_tokens_details?.reasoning_tokens,
  };
  return {
    prompt_tokens: inputTokens,
    completion_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
    ...Object.fromEntries(Object.entries(details).filter(([, value]) => value != null)),
  };
}

export function openAIResult(params: {
  requestedModel: string;
  response: Pick<Response, "output" | "usage" | "model">;
  durationMs?: number;
  tier: PriceTier;
}): ExecuteResult {
  const { requestedModel, response, durationMs, tier } = params;
  return {
    content: extractOpenAIOutputText(response),
    model: response.model ?? requestedModel,
    usage: withCost("openai", requestedModel, openAIUsage(response.usage), tier),
    ...(durationMs === undefined ? {} : { duration_ms: durationMs }),
  };
}
