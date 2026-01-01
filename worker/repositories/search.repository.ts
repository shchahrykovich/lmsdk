/**
 * Repository for managing PromptExecutionLogsForSearch FTS5 table
 * This repository encapsulates raw SQL operations for the full-text search table
 */

export interface SearchRecord {
  variableValue: string;
  logId: number;
  variablePath: string;
  tenantId: number;
  projectId: number;
  promptId: number;
  createdAt: number;
}

export class SearchRepository {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Insert a record into the full-text search table
   * @param record - The search record to insert
   */
  async insert(record: SearchRecord): Promise<void> {
    const { variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt } = record;

    await this.db
      .prepare(
        `INSERT INTO PromptExecutionLogsForSearch (variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt)
      .run();
  }

  /**
   * Insert multiple records in a batch
   * @param records - Array of search records to insert
   */
  async insertBatch(records: SearchRecord[]): Promise<void> {
    try {
      if (records.length === 0) return;

      // Use a transaction for batch inserts
      const statements = records.map((record) => {
        const { variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt } = record;
        return this.db
            .prepare(
                `INSERT INTO PromptExecutionLogsForSearch (variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt);
      });

      await this.db.batch(statements);
    } catch (error) {
      console.log(error);
    }
  }

  /**
   * Search records by text query
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID to filter results
   * @param query - Full-text search query
   * @param limit - Maximum number of results (default: 10)
   */
  async search(
    tenantId: number,
    projectId: number,
    query: string,
    limit: number = 10
  ): Promise<SearchRecord[]> {
    const result = await this.db
      .prepare(
        `SELECT variableValue, logId, variablePath, tenantId, projectId, promptId, createdAt
         FROM PromptExecutionLogsForSearch
         WHERE PromptExecutionLogsForSearch MATCH ?
           AND tenantId = ?
           AND projectId = ?
         ORDER BY rank
         LIMIT ?`
      )
      .bind(query, tenantId, projectId, limit)
      .all<SearchRecord>();

    return result.results || [];
  }

  /**
   * Delete records by logId
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param logId - The log ID to delete
   */
  async deleteByLogId(tenantId: number, logId: number): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM PromptExecutionLogsForSearch
         WHERE logId = ? AND tenantId = ?`
      )
      .bind(logId, tenantId)
      .run();
  }

  /**
   * Delete all records for a project
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID to delete records for
   */
  async deleteByProject(tenantId: number, projectId: number): Promise<void> {
    await this.db
      .prepare(
        `DELETE FROM PromptExecutionLogsForSearch
         WHERE projectId = ? AND tenantId = ?`
      )
      .bind(projectId, tenantId)
      .run();
  }

  /**
   * Get unique variable paths for a project
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID to get paths for
   * @returns Array of unique variable paths
   */
  async getUniqueVariablePaths(
    tenantId: number,
    projectId: number
  ): Promise<string[]> {
    const result = await this.db
      .prepare(
        `SELECT DISTINCT variablePath
         FROM PromptExecutionLogsForSearch
         WHERE tenantId = ? AND projectId = ?
         ORDER BY variablePath ASC`
      )
      .bind(tenantId, projectId)
      .all<{ variablePath: string }>();

    return (result.results || []).map((r) => r.variablePath);
  }

  /**
   * Get log IDs that match a variable path and value search
   * @param tenantId - Tenant ID for cross-tenant protection
   * @param projectId - Project ID to filter results
   * @param variablePath - The variable path to filter by
   * @param searchValue - The value to search for
   * @param operator - The comparison operator (contains, notEmpty)
   * @returns Array of unique log IDs
   */
  async getLogIdsByVariableSearch(
    tenantId: number,
    projectId: number,
    variablePath: string,
    searchValue: string,
    operator: "contains" | "notEmpty" = "contains"
  ): Promise<number[]> {
    let query: string;
    let bindParams: any[];

    // Build query based on operator
    if (operator === "notEmpty") {
      // For "not empty", just check that the variable path exists
      query = `SELECT DISTINCT logId
               FROM PromptExecutionLogsForSearch
               WHERE tenantId = ?
                 AND projectId = ?
                 AND variablePath = ?
               ORDER BY logId DESC`;
      bindParams = [tenantId, projectId, variablePath];
    } else {
      // For "contains", use FTS5 MATCH for full-text search
      // Match on the variableValue column specifically
      query = `SELECT DISTINCT logId
               FROM PromptExecutionLogsForSearch
               WHERE tenantId = ?
                 AND projectId = ?
                 AND variablePath = ?
                 AND PromptExecutionLogsForSearch MATCH ?
               ORDER BY logId DESC`;
      // Construct FTS5 match query for the variableValue column
      const matchQuery = `variableValue: ${searchValue}`;
      bindParams = [tenantId, projectId, variablePath, matchQuery];
    }

    const result = await this.db
      .prepare(query)
      .bind(...bindParams)
      .all<{ logId: number }>();

    return (result.results || []).map((r) => r.logId);
  }
}
