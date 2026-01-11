import type { Context } from "hono";
import type { HonoEnv } from "../routes/app";
import { ProjectId } from "./project-id";
import { ClientInputValidationError } from "./errors";
import { and, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

export class EntityId {
  readonly id: number;
  readonly projectId: number;
  readonly tenantId: number;
  readonly userId: string;

  public constructor(id: number, projectId: ProjectId) {
    this.id = id;
    this.projectId = projectId.id;
    this.tenantId = projectId.tenantId;
    this.userId = projectId.userId;
  }

  private static validate(id: number, paramName: string): void {
    if (isNaN(id) || !Number.isInteger(id) || id <= 0) {
      const entityName = paramName.replace(/Id$/i, "");
      throw new ClientInputValidationError(`Invalid ${entityName} ID`);
    }
  }

  static parse(c: Context<HonoEnv>, paramName: string): EntityId {
    const projectId = ProjectId.parse(c);
    const idParam = c.req.param(paramName);
    const id = parseInt(idParam ?? "");
    this.validate(id, paramName);
    return new EntityId(id, projectId);
  }

  toWhereClause<T extends { id: SQLiteColumn; tenantId: SQLiteColumn; projectId: SQLiteColumn }>(
    table: T
  ): SQL {
    return and(
      eq(table.tenantId, this.tenantId),
      eq(table.projectId, this.projectId),
      eq(table.id, this.id)
    )!;
  }
}
