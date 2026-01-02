import { DrizzleD1Database } from "drizzle-orm/d1";
import { eq, and } from "drizzle-orm";
import { promptExecutionLogs } from "../db/schema";
import { SearchRepository } from "../repositories/search.repository";
import { ObjectToPathsService } from "./object-to-paths.service";

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
    let variables: Record<string, any>;

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

    // Load output.json (provider raw response)
    const outputObject = await this.r2.get(outputPath);
    if (!outputObject) {
      console.warn(`No output.json found at ${outputPath}, skipping usage extraction`);
      return;
    }

    // Load input.json to determine provider
    const inputObject = await this.r2.get(inputPath);
    if (!inputObject) {
      // Consume the output object body to properly dispose of resources
      await outputObject.text();
      console.warn(`No input.json found at ${inputPath}, skipping usage extraction`);
      return;
    }

    let outputText: string;
    let inputText: string;

    try {
      // Consume both R2 objects first to ensure proper resource disposal
      outputText = await outputObject.text();
      inputText = await inputObject.text();
    } catch (error) {
      console.error(`Failed to read JSON files:`, error);
      return;
    }

    try {
      const output = JSON.parse(outputText);
      const input = JSON.parse(inputText);

      // Determine provider from input structure
      const provider = this.determineProvider(input);

      if (!provider) {
        console.warn(`Could not determine provider for log ${log.id}`);
        return;
      }

      let model: string | null = null;
      let usage: any = null;

      // Extract model and usage based on provider
      if (provider === 'openai') {
        // OpenAI output is a single response object
        model = output.model;
        usage = {
          input_tokens: output.usage?.input_tokens || 0,
          cached_tokens: output.usage?.input_tokens_details?.cached_tokens || 0,
          output_tokens: output.usage?.output_tokens || 0,
          reasoning_tokens: output.usage?.output_tokens_details?.reasoning_tokens || 0,
          total_tokens: output.usage?.total_tokens || 0,
        };
      } else if (provider === 'google') {
        // Google output is an array of chunks, find last chunk with usage
        if (Array.isArray(output)) {
          for (const chunk of output) {
            if (chunk.modelVersion) {
              model = chunk.modelVersion;
            }
            if (chunk.usageMetadata) {
              usage = {
                prompt_tokens: chunk.usageMetadata.promptTokenCount || 0,
                cached_tokens: chunk.usageMetadata.cachedContentTokenCount || 0,
                response_tokens: chunk.usageMetadata.candidatesTokenCount || 0,
                thoughts_tokens: chunk.usageMetadata.thoughtsTokenCount || 0,
                tool_use_prompt_tokens: chunk.usageMetadata.toolUsePromptTokenCount || 0,
                total_tokens: chunk.usageMetadata.totalTokenCount || 0,
              };
            }
          }
        }
      }

      if (!model || !usage) {
        console.warn(`Missing model or usage in output.json for log ${log.id}`);
        return;
      }

      // Update the log record with usage statistics
      await this.db
        .update(promptExecutionLogs)
        .set({
          provider,
          model,
          usage: JSON.stringify(usage),
        })
        .where(eq(promptExecutionLogs.id, log.id));

      console.log(`Updated usage statistics for log ${log.id}: ${provider}/${model}`);
    } catch (error) {
      console.error(`Failed to parse or process usage data:`, error);
      // Note: outputObject and inputObject are already consumed in the outer try block
    }
  }

  /**
   * Determine provider from input structure
   * OpenAI has 'input', 'text', 'reasoning' fields
   * Google has 'config', 'contents' fields
   */
  private determineProvider(input: any): string | null {
    if (input.input && input.text && input.reasoning) {
      return 'openai';
    }
    if (input.config && input.contents) {
      return 'google';
    }
    return null;
  }
}
