import { DrizzleD1Database } from "drizzle-orm/d1";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { promptExecutionLogs, prompts } from "../db/schema";
import { SearchRepository } from "../repositories/search.repository";

export interface ProjectLogEntry {
  id: number;
  promptId: number;
  version: number;
  logPath: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  rawTraceId: string | null;
  traceId: string | null;
  createdAt: number | Date;
  promptName: string | null;
  promptSlug: string | null;
  provider: string | null;
  model: string | null;
}

export interface LogFilters {
  isSuccess?: boolean;
  promptId?: number;
  version?: number;
  variablePath?: string;
  variableValue?: string;
  variableOperator?: "contains" | "notEmpty";
}

export interface LogSort {
  field: "createdAt" | "durationMs" | "promptName" | "isSuccess" | "provider";
  direction: "asc" | "desc";
}

export interface LogsListResponse {
  logs: ProjectLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export class LogService {
  private db: DrizzleD1Database;
  private r2?: R2Bucket;
  private searchRepository?: SearchRepository;

  constructor(db: DrizzleD1Database, r2?: R2Bucket, d1?: D1Database) {
    this.db = db;
    this.r2 = r2;
    if (d1) {
      this.searchRepository = new SearchRepository(d1);
    }
  }

  async listProjectLogs(
    tenantId: number,
    projectId: number,
    page: number = 1,
    pageSize: number = 10,
    filters?: LogFilters,
    sort?: LogSort
  ): Promise<LogsListResponse> {
    // If variable filtering is requested, get matching log IDs first
    let variableFilteredLogIds: number[] | undefined;
    if (filters?.variablePath && this.searchRepository) {
      const operator = filters.variableOperator || "contains";
      const searchValue = filters.variableValue || "";

      variableFilteredLogIds = await this.searchRepository.getLogIdsByVariableSearch(
        tenantId,
        projectId,
        filters.variablePath,
        searchValue,
        operator
      );

      // If no logs match the variable search, return empty result
      if (variableFilteredLogIds.length === 0) {
        return {
          logs: [],
          total: 0,
          page,
          pageSize,
          totalPages: 0,
        };
      }

			// D1 has a limit of 100 parameters per query
			// We need 4 base parameters, so limit to 95 IDs to be safe
			if (variableFilteredLogIds.length > 95) {
				variableFilteredLogIds = variableFilteredLogIds.slice(0, 95);
			}
    }

    // Build where conditions
    const whereConditions = [
      eq(promptExecutionLogs.tenantId, tenantId),
      eq(promptExecutionLogs.projectId, projectId),
    ];

    // Apply variable filter by log IDs
    if (variableFilteredLogIds !== undefined) {
      whereConditions.push(inArray(promptExecutionLogs.id, variableFilteredLogIds));
    }

    // Apply filters
    if (filters?.isSuccess !== undefined) {
      whereConditions.push(eq(promptExecutionLogs.isSuccess, filters.isSuccess));
    }

    if (filters?.promptId !== undefined) {
      whereConditions.push(eq(promptExecutionLogs.promptId, filters.promptId));
    }

    if (filters?.version !== undefined) {
      whereConditions.push(eq(promptExecutionLogs.version, filters.version));
    }

    // Get total count
    const [{ total }] = await this.db
      .select({ total: count() })
      .from(promptExecutionLogs)
      .leftJoin(
        prompts,
        and(
          eq(promptExecutionLogs.promptId, prompts.id),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .where(and(...whereConditions));

    // Determine sort order
    let orderByClause;
    const sortField = sort?.field || "createdAt";
    const sortDirection = sort?.direction || "desc";

    switch (sortField) {
      case "promptName":
        orderByClause = sortDirection === "asc" ? asc(prompts.name) : desc(prompts.name);
        break;
      case "durationMs":
        orderByClause = sortDirection === "asc" ? asc(promptExecutionLogs.durationMs) : desc(promptExecutionLogs.durationMs);
        break;
      case "isSuccess":
        orderByClause = sortDirection === "asc" ? asc(promptExecutionLogs.isSuccess) : desc(promptExecutionLogs.isSuccess);
        break;
      case "provider":
        orderByClause = sortDirection === "asc" ? asc(prompts.provider) : desc(prompts.provider);
        break;
      case "createdAt":
      default:
        orderByClause = sortDirection === "asc" ? asc(promptExecutionLogs.createdAt) : desc(promptExecutionLogs.createdAt);
        break;
    }

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const logs = await this.db
      .select({
        id: promptExecutionLogs.id,
        promptId: promptExecutionLogs.promptId,
        version: promptExecutionLogs.version,
        logPath: promptExecutionLogs.logPath,
        isSuccess: promptExecutionLogs.isSuccess,
        errorMessage: promptExecutionLogs.errorMessage,
        durationMs: promptExecutionLogs.durationMs,
        rawTraceId: promptExecutionLogs.rawTraceId,
        traceId: promptExecutionLogs.traceId,
        createdAt: promptExecutionLogs.createdAt,
        promptName: prompts.name,
        promptSlug: prompts.slug,
        provider: prompts.provider,
        model: prompts.model,
      })
      .from(promptExecutionLogs)
      .leftJoin(
        prompts,
        and(
          eq(promptExecutionLogs.promptId, prompts.id),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .where(and(...whereConditions))
      .orderBy(orderByClause)
      .limit(pageSize)
      .offset(offset);

    const totalPages = Math.ceil(total / pageSize);

    return {
      logs,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  async getProjectLog(
    tenantId: number,
    projectId: number,
    logId: number
  ): Promise<ProjectLogEntry | undefined> {
    const [log] = await this.db
      .select({
        id: promptExecutionLogs.id,
        promptId: promptExecutionLogs.promptId,
        version: promptExecutionLogs.version,
        logPath: promptExecutionLogs.logPath,
        isSuccess: promptExecutionLogs.isSuccess,
        errorMessage: promptExecutionLogs.errorMessage,
        durationMs: promptExecutionLogs.durationMs,
        rawTraceId: promptExecutionLogs.rawTraceId,
        traceId: promptExecutionLogs.traceId,
        createdAt: promptExecutionLogs.createdAt,
        promptName: prompts.name,
        promptSlug: prompts.slug,
        provider: prompts.provider,
        model: prompts.model,
      })
      .from(promptExecutionLogs)
      .leftJoin(
        prompts,
        and(
          eq(promptExecutionLogs.promptId, prompts.id),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .where(
        and(
          eq(promptExecutionLogs.tenantId, tenantId),
          eq(promptExecutionLogs.projectId, projectId),
          eq(promptExecutionLogs.id, logId)
        )
      )
      .limit(1);

    return log;
  }

  async getProjectLogDetails(
    tenantId: number,
    projectId: number,
    logId: number
  ): Promise<{ log: ProjectLogEntry | undefined; files: Record<string, unknown> }> {
    const log = await this.getProjectLog(tenantId, projectId, logId);

    const files: Record<string, unknown> = {
      metadata: null,
      input: null,
      output: null,
      result: null,
      response: null,
      variables: null,
    };

    if (!log?.logPath || !this.r2) {
      return { log, files };
    }

    const fetchJson = async (path: string) => {
      const object = await this.r2!.get(path);
      if (!object) {
        return null;
      }
      const text = await object.text();
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    };

    const base = log.logPath.replace(/\/$/, "");
    const [metadata, input, output, result, variables, response] = await Promise.all([
      fetchJson(`${base}/metadata.json`),
      fetchJson(`${base}/input.json`),
      fetchJson(`${base}/output.json`),
      fetchJson(`${base}/result.json`),
      fetchJson(`${base}/variables.json`),
      fetchJson(`${base}/response.json`),
    ]);

    files.metadata = metadata;
    files.input = input;
    files.output = output;
    files.result = result;
    files.variables = variables;
    files.response = response;

    return { log, files };
  }

  async getUniquePromptsForProject(
    tenantId: number,
    projectId: number
  ): Promise<Array<{ promptId: number; promptName: string; version: number }>> {
    const results = await this.db
      .selectDistinct({
        promptId: promptExecutionLogs.promptId,
        version: promptExecutionLogs.version,
        promptName: prompts.name,
      })
      .from(promptExecutionLogs)
      .leftJoin(
        prompts,
        and(
          eq(promptExecutionLogs.promptId, prompts.id),
          eq(prompts.tenantId, tenantId),
          eq(prompts.projectId, projectId)
        )
      )
      .where(
        and(
          eq(promptExecutionLogs.tenantId, tenantId),
          eq(promptExecutionLogs.projectId, projectId)
        )
      )
      .orderBy(prompts.name, promptExecutionLogs.version);

    return results.map((r) => ({
      promptId: r.promptId,
      promptName: r.promptName || "Unknown",
      version: r.version,
    }));
  }

  async getUniqueVariablePathsForProject(
    tenantId: number,
    projectId: number
  ): Promise<string[]> {
    if (!this.searchRepository) {
      return [];
    }

    return await this.searchRepository.getUniqueVariablePaths(tenantId, projectId);
  }
}
