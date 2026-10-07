import { z } from "zod";
import { MAX_RECORDS_PER_CALL } from "../../datasets/dataset-limits";
import { ANTHROPIC_EFFORTS, OPENROUTER_PROVIDER_SORTS, OPENROUTER_REASONING_EFFORTS } from "../../providers/base-provider";

export const MANAGE_TAG = "manage";

export const manageSecurity = [{ apiKey: [] }];

export const SlugOrId = z
  .string()
  .min(1)
  .describe("Slug (for example `support-bot`) or numeric id (for example `12`). A slug match wins over an id match.");

export const ErrorResponse = z.object({
  error: z.string().describe("What went wrong"),
});

export const ValidationErrorResponse = z.object({
  success: z.literal(false),
  errors: z.array(z.object({ path: z.array(z.union([z.string(), z.number()])), message: z.string() }).loose()),
});

const errorContent = (description: string) => ({
  description,
  content: { "application/json": { schema: ErrorResponse } },
});

export const errorResponses = {
  "400": {
    description: "The request body or parameters are invalid",
    content: { "application/json": { schema: ErrorResponse.or(ValidationErrorResponse) } },
  },
  "401": errorContent("The x-api-key header is missing or the key is invalid"),
  "403": errorContent("The key does not have the manage permission this method needs"),
};

export const notFoundResponse = { "404": errorContent("A project, prompt, dataset, evaluation or batch in the path was not found") };

export const conflictResponse = { "409": errorContent("A record with the same name or slug already exists") };

export const jsonContent = <T extends z.ZodType>(
  schema: T,
  description: string
): { description: string; content: { "application/json": { schema: T } } } => ({
  description,
  content: { "application/json": { schema } },
});

export const jsonBody = <T extends z.ZodType>(
  schema: T
): { content: { "application/json": { schema: T } }; required: true } => ({
  content: { "application/json": { schema } },
  required: true,
});

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string().describe("Message text. Use {{variable}} placeholders for dataset values."),
});

const ResponseFormatSchema = z.object({
  type: z.enum(["text", "json_schema", "json"]),
  json_schema: z.record(z.string(), z.unknown()).optional().describe("JSON schema for type json_schema"),
});

const OpenAISettingsSchema = z.looseObject({
  reasoning_effort: z.enum(["low", "medium", "high"]).optional(),
  reasoning_summary: z.enum(["auto", "enabled", "concise"]).optional(),
  store: z.boolean().optional(),
  include_encrypted_reasoning: z.boolean().optional(),
});

const GoogleSettingsSchema = z.looseObject({
  include_thoughts: z.boolean().optional(),
  thinking_budget: z.number().optional(),
  thinking_level: z.enum(["THINKING_LEVEL_UNSPECIFIED", "LOW", "MEDIUM", "HIGH", "MINIMAL"]).optional(),
  google_search_enabled: z.boolean().optional(),
  cache_system_message: z.boolean().optional(),
});

const OpenRouterSettingsSchema = z.looseObject({
  reasoning_effort: z
    .enum(OPENROUTER_REASONING_EFFORTS)
    .optional()
    .describe("Reasoning effort sent to OpenRouter. 'none' turns reasoning off."),
  provider_sort: z
    .enum(OPENROUTER_PROVIDER_SORTS)
    .optional()
    .describe("How OpenRouter orders upstream providers."),
  temperature: z.number().min(0).max(2).optional().describe("Sampling temperature. 0 gives the most repeatable output."),
  max_tokens: z.number().int().positive().optional().describe("Limit on output tokens, reasoning included."),
});

const AnthropicSettingsSchema = z.looseObject({
  max_tokens: z.number().int().positive().optional().describe("Limit on output tokens. Default 16000."),
  effort: z.enum(ANTHROPIC_EFFORTS).optional().describe("Thinking depth. Left out, the model default applies."),
});

const DecisionText = z.string().trim().min(1);

const hasAtLeast = (count: number) => (value: Record<string, unknown>) => Object.keys(value).length >= count;

const DecisionQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("noul"),
    instructions: DecisionText,
    criteria: z.object({ true: DecisionText, false: DecisionText }).describe("What a true and a false answer mean"),
  }),
  z.object({
    type: z.literal("choice"),
    instructions: DecisionText,
    criteria: z
      .record(z.string(), DecisionText)
      .refine(hasAtLeast(2), "A choice question needs at least 2 options")
      .describe("Option key to its description. At least 2 options."),
  }),
  z.object({
    type: z.literal("score"),
    instructions: DecisionText,
    criteria: z.array(DecisionText).min(2).describe("Ordered levels, lowest first. At least 2 levels."),
  }),
]);

export const DECISIONS_PROVIDER = "openrouter-decisions";

const DecisionQuestionsSchema = z
  .record(z.string(), DecisionQuestionSchema)
  .refine(hasAtLeast(1), "Add at least one decision question")
  .describe(
    "Required for provider openrouter-decisions: questions by name, at least one. The user message is sent as the state. The response is always JSON."
  );

export const PromptBodySchema = z.object({
  messages: z.array(MessageSchema).min(1).describe("At least one message"),
  response_format: ResponseFormatSchema.optional(),
  openai_settings: OpenAISettingsSchema.optional(),
  google_settings: GoogleSettingsSchema.optional(),
  openrouter_settings: OpenRouterSettingsSchema.optional(),
  anthropic_settings: AnthropicSettingsSchema.optional(),
  decision_questions: DecisionQuestionsSchema.optional(),
  proxy: z.enum(["none", "cloudflare"]).optional(),
});

export type PromptBody = z.infer<typeof PromptBodySchema>;

export const ProjectSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});

export const PromptSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  provider: z.string(),
  model: z.string(),
  latestVersion: z.number(),
  activeVersion: z.number().nullable().describe("The version that /execute runs"),
  isActive: z.boolean(),
});

export const PromptVersionSchema = z.object({
  id: z.number(),
  version: z.number(),
  provider: z.string(),
  model: z.string(),
  body: z.unknown(),
  createdAt: z.string(),
});

export const DataSetSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  countOfRecords: z.number(),
  schema: z.unknown(),
});

export const EvaluationSchema = z.object({
  id: z.number(),
  name: z.string(),
  slug: z.string(),
  type: z.string(),
  state: z.enum(["created", "running", "finished"]).or(z.string()),
  datasetId: z.number().nullable(),
  workflowId: z.string().nullable(),
  durationMs: z.number().nullable(),
  createdAt: z.string(),
});

export const RecordsBodySchema = z.object({
  records: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .max(MAX_RECORDS_PER_CALL)
    .describe(`1 to ${MAX_RECORDS_PER_CALL} records; each record is an object of variables`),
});

export type ProjectDto = z.infer<typeof ProjectSchema>;
export type PromptDto = z.infer<typeof PromptSchema>;
export type PromptVersionDto = z.infer<typeof PromptVersionSchema>;
export type DataSetDto = z.infer<typeof DataSetSchema>;
export type EvaluationDto = z.infer<typeof EvaluationSchema>;
