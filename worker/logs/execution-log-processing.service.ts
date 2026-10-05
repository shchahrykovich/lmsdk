import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { promptExecutionLogs } from "../db/schema.ts";
import { SearchRepository } from "../repositories/search.repository.ts";
import { ObjectToPathsService } from "../services/object-to-paths.service.ts";

/**
 * Service for processing execution logs in the background
 * Loads variables from R2 and indexes them for full-text search
 */
export class ExecutionLogProcessingService {
  private db: DrizzleD1Database;
  private r2: R2Bucket;
  private searchRepository: SearchRepository;
  private objectToPathsService: ObjectToPathsService;

  constructor(db: DrizzleD1Database, r2: R2Bucket, d1: D1Database) {
    this.db = db;
    this.r2 = r2;
    this.searchRepository = new SearchRepository(d1);
    this.objectToPathsService = new ObjectToPathsService();
  }

  /**
   * Process an execution log by loading variables from R2 and indexing for search
   * Also extracts usage statistics from result.json and updates the log record
   * @param tenantId - Tenant ID
   * @param projectId - Project ID
   * @param logId - Execution log ID
   */
  async processExecutionLog(
    tenantId: number,
    projectId: number,
    logId: number
  ): Promise<void> {
    // Load the execution log from database
    const [log] = await this.db
      .select()
      .from(promptExecutionLogs)
      .where(
        and(
          eq(promptExecutionLogs.id, logId),
          eq(promptExecutionLogs.tenantId, tenantId),
          eq(promptExecutionLogs.projectId, projectId)
        )
      )
      .limit(1);

    if (!log) {
      throw new Error(`Execution log ${logId} not found for tenant ${tenantId}`);
    }

    if (!log.logPath) {
      console.warn(`Execution log ${logId} has no logPath, skipping processing`);
      return;
    }

    // Extract provider, model, and usage from result.json
    await this.extractUsageStatistics(log);

    // Load variables from R2
    const variablesPath = `${log.logPath}/variables.json`;
    const variablesObject = await this.r2.get(variablesPath);

    if (!variablesObject) {
      console.warn(`No variables found at ${variablesPath}, skipping indexing`);
      return;
    }

    const variablesText = await variablesObject.text();
    let variables: Record<string, unknown>;

    try {
      variables = JSON.parse(variablesText);
    } catch (error) {
      console.error(`Failed to parse variables from ${variablesPath}:`, error);
      throw new Error(`Invalid JSON in variables file: ${variablesPath}`);
    }

    // Transform variables into path-value pairs
    const pathValues = this.objectToPathsService.transform(variables);

    if (pathValues.length === 0) {
      console.warn(`No path-value pairs extracted from variables for log ${logId}`);
      return;
    }

    // Create search records for each path-value pair
    const searchRecords = pathValues.map((pv) => {
      const variablePath = pv.path;
      const variableValue = this.objectToPathsService.formatForSearch(pv);

      return {
        variableValue,
        logId,
        variablePath,
        tenantId,
        projectId,
        promptId: log.promptId,
        createdAt: typeof log.createdAt === 'number' ? log.createdAt : Math.floor(log.createdAt.getTime() / 1000),
      };
    });

    // Insert all search records in a batch
    await this.searchRepository.insertBatch(searchRecords);

    console.log(
      `Indexed ${searchRecords.length} path-value pairs for execution log ${logId}`
    );
  }

  /**
   * Extract provider, model, and usage statistics from output.json and input.json
   * Updates the log record with this information
   */
  private async extractUsageStatistics(
    log: typeof promptExecutionLogs.$inferSelect
  ): Promise<void> {
    const outputPath = `${log.logPath}/output.json`;
    const inputPath = `${log.logPath}/input.json`;

    const outputText = await this.readR2Text(outputPath, "output.json");
    if (!outputText) {
      return;
    }

    const inputText = await this.readR2Text(inputPath, "input.json");
    if (!inputText) {
      return;
    }

    const output = this.parseJson(outputText, "output.json");
    const input = this.parseJson(inputText, "input.json");

    if (!output || !input) {
      return;
    }

    const provider = this.determineProvider(input);
    if (!provider) {
      console.warn(`Could not determine provider for log ${log.id}`);
      return;
    }

    const usageResult = this.extractUsage(provider, output);

    if (!usageResult) {
      console.warn(`Missing model or usage in output.json for log ${log.id}`);
      return;
    }

    const cost = await this.readResultCost(log);
    const usage = cost === undefined ? usageResult.usage : { ...usageResult.usage, cost };

    await this.db
      .update(promptExecutionLogs)
      .set({
        provider,
        model: usageResult.model,
        usage: JSON.stringify(usage),
      })
      .where(eq(promptExecutionLogs.id, log.id));

    console.log(`Updated usage statistics for log ${log.id}: ${provider}/${usageResult.model}`);
  }

  private async readR2Text(path: string, label: string): Promise<string | null> {
    const object = await this.r2.get(path);
    if (!object) {
      console.warn(`No ${label} found at ${path}, skipping usage extraction`);
      return null;
    }

    try {
      return await object.text();
    } catch (error) {
      console.error(`Failed to read ${label}:`, error);
      return null;
    }
  }

  private async readResultCost(log: typeof promptExecutionLogs.$inferSelect): Promise<number | undefined> {
    const object = await this.r2.get(`${log.logPath}/result.json`);
    if (!object) {
      return undefined;
    }

    const result = this.parseJson(await object.text(), "result.json");
    if (!this.isRecord(result) || !this.isRecord(result.usage)) {
      return undefined;
    }

    return typeof result.usage.cost === "number" ? result.usage.cost : undefined;
  }

  private parseJson(text: string, label: string): unknown | null {
    try {
      return JSON.parse(text);
    } catch (error) {
      console.error(`Failed to parse ${label}:`, error);
      return null;
    }
  }

  private extractUsage(provider: string, output: unknown) {
    switch (provider) {
      case "openai":
        return this.extractOpenAiUsage(output);
      case "google":
        return this.extractGoogleUsage(output);
      case "openrouter":
        return this.extractOpenRouterUsage(output);
      case "openrouter-decisions":
        return this.extractDecisionsUsage(output);
      default:
        return null;
    }
  }

  private extractOpenAiUsage(output: unknown) {
    if (!this.isRecord(output) || !this.isRecord(output.usage)) {
      return null;
    }

    const model = output.model;
    if (typeof model !== "string") {
      return null;
    }

    const usage = output.usage;
    const inputDetails = this.isRecord(usage.input_tokens_details)
      ? usage.input_tokens_details
      : undefined;
    const outputDetails = this.isRecord(usage.output_tokens_details)
      ? usage.output_tokens_details
      : undefined;

    return {
      model,
      usage: {
        input_tokens: this.numberOrZero(usage.input_tokens),
        cached_tokens: this.numberOrZero(inputDetails?.cached_tokens),
        output_tokens: this.numberOrZero(usage.output_tokens),
        reasoning_tokens: this.numberOrZero(outputDetails?.reasoning_tokens),
        total_tokens: this.numberOrZero(usage.total_tokens),
      },
    };
  }

  private extractOpenRouterUsage(output: unknown) {
    if (!this.isRecord(output) || !this.isRecord(output.usage) || typeof output.model !== "string") {
      return null;
    }

    const usage = output.usage;
    const promptDetails = this.isRecord(usage.prompt_tokens_details) ? usage.prompt_tokens_details : undefined;
    const completionDetails = this.isRecord(usage.completion_tokens_details)
      ? usage.completion_tokens_details
      : undefined;

    return {
      model: output.model,
      usage: {
        prompt_tokens: this.numberOrZero(usage.prompt_tokens),
        cached_tokens: this.numberOrZero(promptDetails?.cached_tokens),
        completion_tokens: this.numberOrZero(usage.completion_tokens),
        reasoning_tokens: this.numberOrZero(completionDetails?.reasoning_tokens),
        total_tokens: this.numberOrZero(usage.total_tokens),
      },
    };
  }

  private extractDecisionsUsage(output: unknown) {
    if (!this.isRecord(output) || !this.isRecord(output.usage) || typeof output.model !== "string") {
      return null;
    }

    const inputTokens = this.numberOrZero(output.usage.input_tokens);
    const outputTokens = this.numberOrZero(output.usage.output_tokens);

    return {
      model: output.model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
      },
    };
  }

  private extractGoogleUsage(output: unknown) {
    if (!Array.isArray(output)) {
      return null;
    }

    const usageResult = output.reduce(
      (acc, chunk) => this.updateGoogleUsage(acc, chunk),
      { model: null, usage: null as Record<string, number> | null }
    );

    if (!usageResult.model || !usageResult.usage) {
      return null;
    }

    return { model: usageResult.model, usage: usageResult.usage };
  }

  /**
   * Determine provider from input structure
   * OpenAI has 'input', 'text', 'reasoning' fields
   * Google has 'config', 'contents' fields
   * OpenRouter has 'model', 'messages' fields
   * OpenRouter Decisions has 'state', 'questions' fields
   */
  private determineProvider(input: unknown): string | null {
    if (!this.isRecord(input)) {
      return null;
    }
    if ("input" in input && "text" in input && "reasoning" in input) {
      return 'openai';
    }
    if ("config" in input && "contents" in input) {
      return 'google';
    }
    if ("model" in input && "messages" in input) {
      return 'openrouter';
    }
    if ("state" in input && "questions" in input) {
      return 'openrouter-decisions';
    }
    return null;
  }

  private numberOrZero(value?: unknown): number {
    return typeof value === "number" ? value : 0;
  }

  private updateGoogleUsage(
    acc: { model: string | null; usage: Record<string, number> | null },
    chunk: unknown
  ): { model: string | null; usage: Record<string, number> | null } {
    if (!this.isRecord(chunk)) {
      return acc;
    }

    const model = typeof chunk.modelVersion === "string" ? chunk.modelVersion : acc.model;
    const usageMetadata = this.isRecord(chunk.usageMetadata)
      ? chunk.usageMetadata
      : undefined;
    if (!usageMetadata) {
      return { model, usage: acc.usage };
    }

    return {
      model,
      usage: {
        prompt_tokens: this.numberOrZero(usageMetadata.promptTokenCount),
        cached_tokens: this.numberOrZero(usageMetadata.cachedContentTokenCount),
        response_tokens: this.numberOrZero(usageMetadata.candidatesTokenCount),
        thoughts_tokens: this.numberOrZero(usageMetadata.thoughtsTokenCount),
        tool_use_prompt_tokens: this.numberOrZero(usageMetadata.toolUsePromptTokenCount),
        total_tokens: this.numberOrZero(usageMetadata.totalTokenCount),
      },
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
  }
}
