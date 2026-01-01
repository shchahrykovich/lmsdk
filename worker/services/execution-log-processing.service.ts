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
      console.warn(`Execution log ${logId} has no logPath, skipping indexing`);
      return;
    }

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
}
