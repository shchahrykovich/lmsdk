import type { Context } from "hono";
import type { HonoEnv } from "../routes/app";
import { getUserFromContext } from "../middleware/auth";
import { ClientInputValidationError } from "./errors";
import { and, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

/**
 * Parses and validates project ID from route parameters and user context
 */
export class ProjectId {
  readonly id: number;
  readonly tenantId: number;
  readonly userId: string;

  public constructor(id: number, tenantId: number, userId: string) {
    this.id = id;
    this.tenantId = tenantId;
    this.userId = userId;
  }

  private static validate(id: number): void {
    if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
      throw new ClientInputValidationError("Invalid project ID");
    }
  }

  /**
   * Parse project ID from route parameter and extract user from context
   * @param c - Hono context
   * @throws {ClientInputValidationError} If parameter is invalid
   */
  static parse(c: Context<HonoEnv>): ProjectId {
    const user = getUserFromContext(c);
    const idParam = c.req.param("projectId");
    const id = parseInt(idParam ?? "");
    this.validate(id);
    return new ProjectId(id, user.tenantId, user.id);
  }

  toWhereClause<T extends { tenantId: SQLiteColumn; projectId: SQLiteColumn }>(
    table: T
  ): SQL {
    return and(
      eq(table.tenantId, this.tenantId),
      eq(table.projectId, this.id)
    )!;
  }
}
