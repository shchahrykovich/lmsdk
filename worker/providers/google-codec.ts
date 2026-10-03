import type { ExecuteRequest, ExecuteResult, TokenUsage } from "./base-provider";
import { withCost, type PriceTier } from "../pricing/cost";

export type GoogleUsageMetadata = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
  cachedContentTokenCount?: number;
};

export type GoogleContent = { role: string; parts: { text: string }[] };

export interface GoogleRequestParams {
  model: string;
  config: Record<string, unknown>;
  contents: GoogleContent[];
}

export interface GoogleRawPart {
  text?: string;
  thought?: boolean;
}

export interface GoogleRawResponse {
  candidates?: { content?: { parts?: GoogleRawPart[] } }[];
  usageMetadata?: GoogleUsageMetadata;
  modelVersion?: string;
}

export function splitGoogleContents(messages: ExecuteRequest["messages"]): {
  systemInstruction: string;
  contents: GoogleContent[];
} {
  let systemInstruction = "";
  const contents: GoogleContent[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemInstruction += msg.content + "\n\n";
    } else if (msg.role === "user") {
      contents.push({ role: "user", parts: [{ text: msg.content }] });
    } else if (msg.role === "assistant") {
      contents.push({ role: "model", parts: [{ text: msg.content }] });
    }
  }

  if (contents.length === 0 && systemInstruction) {
    contents.push({ role: "user", parts: [{ text: systemInstruction }] });
    systemInstruction = "";
  }

  return { systemInstruction, contents };
}

const applySystemInstruction = (
  config: Record<string, unknown>,
  systemInstruction: string,
  cachedContentName: string | null
) => {
  if (cachedContentName) {
    config.cachedContent = cachedContentName;
    return;
  }
  if (systemInstruction.trim()) {
    config.systemInstruction = systemInstruction.trim();
  }
};

const GEMINI_TYPES = new Set(["STRING", "NUMBER", "INTEGER", "BOOLEAN", "ARRAY", "OBJECT", "NULL"]);

type JsonSchema = Record<string, unknown>;

const geminiType = (value: string): string => (GEMINI_TYPES.has(value.toUpperCase()) ? value.toUpperCase() : "TYPE_UNSPECIFIED");

const withoutNullBranch = (schema: JsonSchema, target: JsonSchema): JsonSchema => {
  const anyOf = schema.anyOf as JsonSchema[] | undefined;
  if (anyOf?.length !== 2) return schema;
  const nullIndex = anyOf.findIndex((branch) => branch.type === "null");
  if (nullIndex < 0) return schema;
  target.nullable = true;
  return anyOf[1 - nullIndex]!;
};

const applyTypeList = (types: string[], target: JsonSchema): void => {
  if (types.includes("null")) target.nullable = true;
  const rest = types.filter((type) => type !== "null");
  if (rest.length === 1) {
    target.type = geminiType(rest[0]!);
  } else {
    target.anyOf = rest.map((type) => ({ type: geminiType(type) }));
  }
};

const convertField = (target: JsonSchema, name: string, value: unknown): void => {
  if (name === "type") {
    if (!Array.isArray(value)) target.type = geminiType(String(value));
  } else if (name === "items") {
    target.items = toGeminiSchema(value as JsonSchema);
  } else if (name === "anyOf") {
    const branches = value as JsonSchema[];
    if (branches.some((branch) => branch.type === "null")) target.nullable = true;
    target.anyOf = branches.filter((branch) => branch.type !== "null").map(toGeminiSchema);
  } else if (name === "properties") {
    target.properties = Object.fromEntries(
      Object.entries(value as Record<string, JsonSchema>).map(([key, child]) => [key, toGeminiSchema(child)])
    );
  } else if (name !== "additionalProperties") {
    target[name] = value;
  }
};

export function toGeminiSchema(schema: JsonSchema): JsonSchema {
  const target: JsonSchema = {};
  const source = withoutNullBranch(schema, target);
  if (Array.isArray(source.type)) {
    applyTypeList(source.type as string[], target);
  }
  for (const [name, value] of Object.entries(source)) {
    if (value != null) convertField(target, name, value);
  }
  return target;
}

const applyResponseFormat = (config: Record<string, unknown>, responseFormat: ExecuteRequest["response_format"]) => {
  if (responseFormat?.type !== "json_schema" && responseFormat?.type !== "json") {
    return;
  }
  config.responseMimeType = "application/json";
  if (responseFormat.json_schema) {
    config.responseSchema = toGeminiSchema((responseFormat.json_schema.schema ?? responseFormat.json_schema) as JsonSchema);
  }
};

const applyGoogleSettings = (config: Record<string, unknown>, googleSettings: ExecuteRequest["google_settings"]) => {
  if (!googleSettings) return;

  const thinkingConfig: Record<string, unknown> = {};
  if (googleSettings.include_thoughts !== undefined) {
    thinkingConfig.includeThoughts = googleSettings.include_thoughts;
  }
  if (googleSettings.thinking_budget !== undefined && googleSettings.thinking_budget != 0) {
    thinkingConfig.thinkingBudget = googleSettings.thinking_budget;
  } else if (googleSettings.thinking_level && googleSettings.thinking_level !== "THINKING_LEVEL_UNSPECIFIED") {
    thinkingConfig.thinkingLevel = googleSettings.thinking_level;
  }
  if (Object.keys(thinkingConfig).length > 0) {
    config.thinkingConfig = thinkingConfig;
  }
  if (googleSettings.google_search_enabled) {
    config.tools = [{ googleSearch: {} }];
  }
};

export function buildGoogleConfig(
  responseFormat: ExecuteRequest["response_format"],
  googleSettings: ExecuteRequest["google_settings"],
  systemInstruction: string,
  cachedContentName: string | null
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  applySystemInstruction(config, systemInstruction, cachedContentName);
  applyResponseFormat(config, responseFormat);
  applyGoogleSettings(config, googleSettings);
  return config;
}

export function buildGoogleRequest(request: ExecuteRequest, cachedContentName: string | null): GoogleRequestParams {
  const { systemInstruction, contents } = splitGoogleContents(request.messages);
  return {
    model: request.model,
    config: buildGoogleConfig(request.response_format, request.google_settings, systemInstruction, cachedContentName),
    contents,
  };
}

const GENERATION_CONFIG_KEYS = ["responseMimeType", "responseSchema", "thinkingConfig"] as const;

export function toGoogleRestRequest(params: GoogleRequestParams): Record<string, unknown> {
  const { config, contents } = params;
  const rest: Record<string, unknown> = { contents };
  if (typeof config.systemInstruction === "string") {
    rest.systemInstruction = { parts: [{ text: config.systemInstruction }], role: "user" };
  }
  if (config.cachedContent) {
    rest.cachedContent = config.cachedContent;
  }
  if (config.tools) {
    rest.tools = config.tools;
  }
  const generationConfig = Object.fromEntries(
    GENERATION_CONFIG_KEYS.filter((key) => config[key] !== undefined).map((key) => [key, config[key]])
  );
  if (Object.keys(generationConfig).length > 0) {
    rest.generationConfig = generationConfig;
  }
  return rest;
}

export function googleResponseText(response: GoogleRawResponse): string {
  const parts = response.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((part) => typeof part.text === "string" && part.thought !== true)
    .map((part) => part.text)
    .join("");
}

export function googleUsage(usageMetadata: GoogleUsageMetadata | null | undefined): TokenUsage {
  return {
    prompt_tokens: usageMetadata?.promptTokenCount ?? 0,
    completion_tokens: usageMetadata?.candidatesTokenCount ?? 0,
    total_tokens: usageMetadata?.totalTokenCount ?? 0,
    thoughts_tokens: usageMetadata?.thoughtsTokenCount,
    tool_use_prompt_tokens: usageMetadata?.toolUsePromptTokenCount,
    cached_content_tokens: usageMetadata?.cachedContentTokenCount,
  };
}

export function googleResult(params: {
  model: string;
  outputText: string;
  usageMetadata: GoogleUsageMetadata | null | undefined;
  durationMs?: number;
  tier: PriceTier;
}): ExecuteResult {
  const { model, outputText, usageMetadata, durationMs, tier } = params;
  return {
    content: outputText,
    model,
    usage: withCost("google", model, googleUsage(usageMetadata), tier),
    ...(durationMs === undefined ? {} : { duration_ms: durationMs }),
  };
}
