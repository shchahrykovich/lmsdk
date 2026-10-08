import { sqliteTable, text, integer, real, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Tenants table
export const tenants = sqliteTable("Tenants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
});

// Projects table
export const projects = sqliteTable("Projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  tenantId: integer("tenantId").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdNameUnique: uniqueIndex("Projects_tenantId_name_key").on(table.tenantId, table.name),
  tenantIdSlugUnique: uniqueIndex("Projects_tenantId_slug_key").on(table.tenantId, table.slug),
}));

// Prompts table
export const prompts = sqliteTable("Prompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  isActive: integer("isActive", { mode: "boolean" }).notNull().default(true),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  latestVersion: integer("latestVersion").notNull(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  body: text("body").notNull().default("{}"),
  slug: text("slug").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdProjectIdNameUnique: uniqueIndex("Prompts_tenantId_projectId_name_key").on(table.tenantId, table.projectId, table.name),
  tenantIdProjectIdSlugUnique: uniqueIndex("Prompts_tenantId_projectId_slug_key").on(table.tenantId, table.projectId, table.slug),
}));

// PromptRouters table
export const promptRouters = sqliteTable("PromptRouters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  promptId: integer("promptId").notNull(),
  version: integer("version").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  promptIdIdx: index("PromptRouters_promptId_idx").on(table.promptId),
}));

// PromptVersions table
export const promptVersions = sqliteTable("PromptVersions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  promptId: integer("promptId").notNull(),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  version: integer("version").notNull(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  body: text("body").notNull().default("{}"),
  slug: text("slug").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdProjectIdPromptIdVersionUnique: uniqueIndex("PromptVersions_tenantId_projectId_promptId_version_key").on(table.tenantId, table.projectId, table.promptId, table.version),
}));

// User table (better-auth)
export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  tenantId: integer("tenantId").notNull().default(-1),
  name: text("name").notNull(),
  email: text("email").notNull(),
  emailVerified: integer("emailVerified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  emailUnique: uniqueIndex("user_email_key").on(table.email),
}));

// Session table (better-auth)
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  token: text("token").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId").notNull(),
}, (table) => ({
  tokenUnique: uniqueIndex("session_token_key").on(table.token),
  userIdIdx: index("session_userId_idx").on(table.userId),
}));

// Account table (better-auth)
export const account = sqliteTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId").notNull(),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: integer("accessTokenExpiresAt", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refreshTokenExpiresAt", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  userIdIdx: index("account_userId_idx").on(table.userId),
}));

// Verification table (better-auth)
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expiresAt", { mode: "timestamp" }).notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  identifierIdx: index("verification_identifier_idx").on(table.identifier),
}));

// Apikey table (better-auth API key plugin)
export const apikey = sqliteTable("apikey", {
  id: text("id").primaryKey(),
  name: text("name"),
  start: text("start"),
  prefix: text("prefix"),
  key: text("key").notNull(),
  userId: text("userId").notNull(),
  refillInterval: integer("refillInterval"),
  refillAmount: integer("refillAmount"),
  lastRefillAt: integer("lastRefillAt", { mode: "timestamp" }),
  enabled: integer("enabled", { mode: "boolean" }).default(true),
  rateLimitEnabled: integer("rateLimitEnabled", { mode: "boolean" }).default(true),
  rateLimitTimeWindow: integer("rateLimitTimeWindow").default(86400000),
  rateLimitMax: integer("rateLimitMax").default(10),
  requestCount: integer("requestCount").default(0),
  remaining: integer("remaining"),
  lastRequest: integer("lastRequest", { mode: "timestamp" }),
  expiresAt: integer("expiresAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull(),
  permissions: text("permissions"),
  metadata: text("metadata"),
}, (table) => ({
  keyIdx: index("apikey_key_idx").on(table.key),
  userIdIdx: index("apikey_userId_idx").on(table.userId),
}));

// Traces table
export const traces = sqliteTable("Traces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  traceId: text("traceId").notNull(),
  totalLogs: integer("totalLogs").notNull().default(0),
  successCount: integer("successCount").notNull().default(0),
  errorCount: integer("errorCount").notNull().default(0),
  totalDurationMs: integer("totalDurationMs").notNull().default(0),
  stats: text("stats"),
  firstLogAt: integer("firstLogAt", { mode: "timestamp" }),
  lastLogAt: integer("lastLogAt", { mode: "timestamp" }),
  tracePath: text("tracePath"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdProjectIdTraceIdUnique: uniqueIndex("Traces_tenantId_projectId_traceId_key").on(table.tenantId, table.projectId, table.traceId),
  tenantIdIdx: index("Traces_tenantId_idx").on(table.tenantId),
  projectIdTenantIdIdx: index("Traces_projectId_tenantId_idx").on(table.projectId, table.tenantId),
  traceIdIdx: index("Traces_traceId_idx").on(table.traceId),
}));

// PromptExecutionLogs table
export const promptExecutionLogs = sqliteTable("PromptExecutionLogs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  promptId: integer("promptId").notNull(),
  version: integer("version").notNull(),
  logPath: text("logPath"),
  isSuccess: integer("isSuccess", { mode: "boolean" }).notNull().default(false),
  errorMessage: text("errorMessage"),
  durationMs: integer("durationMs"),
  provider: text("provider"),
  model: text("model"),
  usage: text("usage"),
  rawTraceId: text("rawTraceId"),
  traceId: text("traceId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdIdx: index("PromptExecutionLogs_tenantId_idx").on(table.tenantId),
  promptIdIdx: index("PromptExecutionLogs_promptId_idx").on(table.promptId),
  createdAtIdx: index("PromptExecutionLogs_createdAt_idx").on(table.createdAt),
  projectIdTenantIdIdx: index("PromptExecutionLogs_projectId_tenantId_idx").on(table.projectId, table.tenantId),
  traceIdIdx: index("PromptExecutionLogs_traceId_idx").on(table.tenantId, table.projectId, table.traceId),
}));

// DataSets table
export const dataSets = sqliteTable("DataSets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  isDeleted: integer("isDeleted", { mode: "boolean" }).notNull().default(false),
  countOfRecords: integer("countOfRecords").notNull().default(0),
  schema: text("schema").notNull().default("{}"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdProjectIdNameUnique: uniqueIndex("DataSets_tenantId_projectId_name_key").on(table.tenantId, table.projectId, table.name),
  tenantIdProjectIdSlugUnique: uniqueIndex("DataSets_tenantId_projectId_slug_key").on(table.tenantId, table.projectId, table.slug),
  tenantIdIdx: index("DataSets_tenantId_idx").on(table.tenantId),
  projectIdTenantIdIdx: index("DataSets_projectId_tenantId_idx").on(table.projectId, table.tenantId),
}));

// DataSetRecords table
export const dataSetRecords = sqliteTable("DataSetRecords", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  dataSetId: integer("dataSetId").notNull(),
  variables: text("variables").notNull().default("{}"),
  isDeleted: integer("isDeleted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  dataSetIdIdx: index("DataSetRecords_dataSetId_idx").on(table.dataSetId),
  tenantIdIdx: index("DataSetRecords_tenantId_idx").on(table.tenantId),
  projectIdTenantIdIdx: index("DataSetRecords_projectId_tenantId_idx").on(table.projectId, table.tenantId),
}));

// Evaluations table
export const evaluations = sqliteTable("Evaluations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  datasetId: integer("datasetId"),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  type: text("type").notNull(),
  state: text("state").notNull(),
  workflowId: text("workflowId"),
  durationMs: integer("durationMs"),
  inputSchema: text("inputSchema").notNull().default("{}"),
  outputSchema: text("outputSchema").notNull().default("{}"),
  summary: text("summary"),
  baseEvaluationId: integer("baseEvaluationId"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  tenantIdProjectIdNameUnique: uniqueIndex("Evaluations_tenantId_projectId_name_key").on(table.tenantId, table.projectId, table.name),
  tenantIdProjectIdSlugUnique: uniqueIndex("Evaluations_tenantId_projectId_slug_key").on(table.tenantId, table.projectId, table.slug),
  tenantIdIdx: index("Evaluations_tenantId_idx").on(table.tenantId),
  projectIdTenantIdIdx: index("Evaluations_projectId_tenantId_idx").on(table.projectId, table.tenantId),
  datasetIdIdx: index("Evaluations_datasetId_idx").on(table.datasetId),
}));

// EvaluationPrompts table
export const evaluationPrompts = sqliteTable("EvaluationPrompts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  evaluationId: integer("evaluationId").notNull(),
  promptId: integer("promptId").notNull(),
  versionId: integer("versionId").notNull(),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  evaluationIdIdx: index("EvaluationPrompts_evaluationId_idx").on(table.evaluationId),
  tenantIdIdx: index("EvaluationPrompts_tenantId_idx").on(table.tenantId),
  projectIdTenantIdIdx: index("EvaluationPrompts_projectId_tenantId_idx").on(table.projectId, table.tenantId),
}));

// EvaluationResults table
export const evaluationResults = sqliteTable("EvaluationResults", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  evaluationId: integer("evaluationId").notNull(),
  dataSetRecordId: integer("dataSetRecordId").notNull(),
  promptId: integer("promptId").notNull(),
  versionId: integer("versionId").notNull(),
  result: text("result").notNull().default("{}"),
  durationMs: integer("durationMs"),
  stats: text("stats").notNull().default("{}"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  evaluationIdIdx: index("EvaluationResults_evaluationId_idx").on(table.evaluationId),
  dataSetRecordIdIdx: index("EvaluationResults_dataSetRecordId_idx").on(table.dataSetRecordId),
  tenantIdIdx: index("EvaluationResults_tenantId_idx").on(table.tenantId),
  projectIdTenantIdIdx: index("EvaluationResults_projectId_tenantId_idx").on(table.projectId, table.tenantId),
}));

export const evaluationEvents = sqliteTable("EvaluationEvents", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  evaluationId: integer("evaluationId").notNull(),
  type: text("type").notNull(),
  recordId: integer("recordId"),
  promptId: integer("promptId"),
  versionId: integer("versionId"),
  details: text("details").notNull().default("{}"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  evaluationIdx: index("EvaluationEvents_tenantId_projectId_evaluationId_idx").on(table.tenantId, table.projectId, table.evaluationId),
}));

export const evaluationComparisons = sqliteTable("EvaluationComparisons", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  evaluationId: integer("evaluationId").notNull(),
  dataSetRecordId: integer("dataSetRecordId").notNull(),
  leftVersionId: integer("leftVersionId").notNull(),
  rightVersionId: integer("rightVersionId").notNull(),
  description: text("description"),
  score: integer("score"),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  pairUnique: uniqueIndex("EvaluationComparisons_evaluationId_record_pair_key").on(table.evaluationId, table.dataSetRecordId, table.leftVersionId, table.rightVersionId),
  evaluationIdx: index("EvaluationComparisons_tenantId_projectId_evaluationId_idx").on(table.tenantId, table.projectId, table.evaluationId),
}));


// Type exports for use in application code
export const batches = sqliteTable("Batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  promptId: integer("promptId").notNull(),
  version: integer("version").notNull(),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  mode: text("mode").notNull(),
  state: text("state").notNull().default("draft"),
  idempotencyKey: text("idempotencyKey"),
  metadata: text("metadata").notNull().default("{}"),
  totalItems: integer("totalItems").notNull().default(0),
  totalBytes: integer("totalBytes").notNull().default(0),
  succeededCount: integer("succeededCount").notNull().default(0),
  erroredCount: integer("erroredCount").notNull().default(0),
  expiredCount: integer("expiredCount").notNull().default(0),
  cancelledCount: integer("cancelledCount").notNull().default(0),
  promptTokens: integer("promptTokens").notNull().default(0),
  completionTokens: integer("completionTokens").notNull().default(0),
  totalTokens: integer("totalTokens").notNull().default(0),
  costUsd: real("costUsd").notNull().default(0),
  unpricedCount: integer("unpricedCount").notNull().default(0),
  workflowId: text("workflowId"),
  errorMessage: text("errorMessage"),
  cancelRequestedAt: integer("cancelRequestedAt", { mode: "timestamp" }),
  submittedAt: integer("submittedAt", { mode: "timestamp" }),
  finishedAt: integer("finishedAt", { mode: "timestamp" }),
  resultsExpireAt: integer("resultsExpireAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  idempotencyKeyUnique: uniqueIndex("Batches_tenantId_projectId_promptId_idempotencyKey_key").on(
    table.tenantId,
    table.projectId,
    table.promptId,
    table.idempotencyKey
  ),
  promptIdx: index("Batches_tenantId_projectId_promptId_idx").on(table.tenantId, table.projectId, table.promptId),
  resultsExpireAtIdx: index("Batches_resultsExpireAt_idx").on(table.resultsExpireAt),
}));

export const batchShards = sqliteTable("BatchShards", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batchId").notNull(),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  seq: integer("seq").notNull(),
  parts: text("parts").notNull().default("[]"),
  itemCount: integer("itemCount").notNull(),
  bytes: integer("bytes").notNull(),
  state: text("state").notNull().default("planned"),
  providerBatchId: text("providerBatchId"),
  inputFileId: text("inputFileId"),
  providerStatus: text("providerStatus"),
  outcome: text("outcome"),
  resultFiles: text("resultFiles").notNull().default("[]"),
  errorMessage: text("errorMessage"),
  submitAttempts: integer("submitAttempts").notNull().default(0),
  submittedAt: integer("submittedAt", { mode: "timestamp" }),
  endedAt: integer("endedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
  updatedAt: integer("updatedAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  batchSeqUnique: uniqueIndex("BatchShards_batchId_seq_key").on(table.batchId, table.seq),
}));

export const batchItems = sqliteTable("BatchItems", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  batchId: integer("batchId").notNull(),
  tenantId: integer("tenantId").notNull(),
  projectId: integer("projectId").notNull(),
  customId: text("customId").notNull(),
  partKey: text("partKey").notNull(),
  lineIndex: integer("lineIndex").notNull(),
  byteOffset: integer("byteOffset").notNull(),
  bytes: integer("bytes").notNull(),
  shardId: integer("shardId"),
  status: text("status").notNull().default("pending"),
  promptTokens: integer("promptTokens"),
  completionTokens: integer("completionTokens"),
  totalTokens: integer("totalTokens"),
  usage: text("usage"),
  costUsd: real("costUsd"),
  error: text("error"),
  hasResult: integer("hasResult", { mode: "boolean" }).notNull().default(false),
  completedAt: integer("completedAt", { mode: "timestamp" }),
  createdAt: integer("createdAt", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
}, (table) => ({
  customIdUnique: uniqueIndex("BatchItems_batchId_customId_key").on(table.batchId, table.customId),
  lineUnique: uniqueIndex("BatchItems_batchId_partKey_lineIndex_key").on(table.batchId, table.partKey, table.lineIndex),
  statusIdx: index("BatchItems_batchId_status_idx").on(table.batchId, table.status),
  shardIdx: index("BatchItems_batchId_shardId_idx").on(table.batchId, table.shardId),
}));

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Prompt = typeof prompts.$inferSelect;
export type NewPrompt = typeof prompts.$inferInsert;
export type PromptRouter = typeof promptRouters.$inferSelect;
export type NewPromptRouter = typeof promptRouters.$inferInsert;
export type PromptVersion = typeof promptVersions.$inferSelect;
export type NewPromptVersion = typeof promptVersions.$inferInsert;
export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Session = typeof session.$inferSelect;
export type NewSession = typeof session.$inferInsert;
export type Account = typeof account.$inferSelect;
export type NewAccount = typeof account.$inferInsert;
export type Verification = typeof verification.$inferSelect;
export type NewVerification = typeof verification.$inferInsert;
export type Apikey = typeof apikey.$inferSelect;
export type NewApikey = typeof apikey.$inferInsert;
export type PromptExecutionLog = typeof promptExecutionLogs.$inferSelect;
export type NewPromptExecutionLog = typeof promptExecutionLogs.$inferInsert;
export type Trace = typeof traces.$inferSelect;
export type NewTrace = typeof traces.$inferInsert;
export type DataSet = typeof dataSets.$inferSelect;
export type NewDataSet = typeof dataSets.$inferInsert;
export type DataSetRecord = typeof dataSetRecords.$inferSelect;
export type NewDataSetRecord = typeof dataSetRecords.$inferInsert;
export type Evaluation = typeof evaluations.$inferSelect;
export type NewEvaluation = typeof evaluations.$inferInsert;
export type EvaluationPrompt = typeof evaluationPrompts.$inferSelect;
export type NewEvaluationPrompt = typeof evaluationPrompts.$inferInsert;
export type EvaluationResult = typeof evaluationResults.$inferSelect;
export type NewEvaluationResult = typeof evaluationResults.$inferInsert;
export type EvaluationEventRow = typeof evaluationEvents.$inferSelect;
export type EvaluationComparison = typeof evaluationComparisons.$inferSelect;
export type NewEvaluationEventRow = typeof evaluationEvents.$inferInsert;
export type Batch = typeof batches.$inferSelect;
export type NewBatch = typeof batches.$inferInsert;
export type BatchShard = typeof batchShards.$inferSelect;
export type NewBatchShard = typeof batchShards.$inferInsert;
export type BatchItem = typeof batchItems.$inferSelect;
export type NewBatchItem = typeof batchItems.$inferInsert;
