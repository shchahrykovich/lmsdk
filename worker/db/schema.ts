import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
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


// Type exports for use in application code
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