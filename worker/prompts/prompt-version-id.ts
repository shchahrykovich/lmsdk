import type { Context } from "hono";
import type { HonoEnv } from "../routes/app";
import { EntityId } from "../shared/entity-id";
import { ProjectId } from "../shared/project-id";
import { ClientInputValidationError } from "../shared/errors";
import { and, eq, type SQL } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";

export class PromptVersionId {
	readonly version: number;
	readonly promptId: number;
	readonly projectId: number;
	readonly tenantId: number;
	readonly userId: string;

	public constructor(version: number, promptEntityId: EntityId<number>) {
		this.version = version;
		this.promptId = promptEntityId.id;
		this.projectId = promptEntityId.projectId;
		this.tenantId = promptEntityId.tenantId;
		this.userId = promptEntityId.userId;
	}

	public getPromptId(): EntityId<number> {
		const projectId = new ProjectId(this.projectId, this.tenantId, this.userId);
		return new EntityId<number>(this.promptId, projectId);
	}

	public getProjectId(): ProjectId {
		return new ProjectId(this.projectId, this.tenantId, this.userId);
	}

	private static validate(version: number): void {
		if (isNaN(version) || !Number.isInteger(version) || version <= 0) {
			throw new ClientInputValidationError("Invalid version");
		}
	}

	static parse(
		c: Context<HonoEnv>,
		promptParamName = "promptId",
		versionParamName = "version"
	): PromptVersionId {
		const promptEntityId = EntityId.parse(c, promptParamName);
		const versionParam = c.req.param(versionParamName);
		const version = parseInt(versionParam ?? "");
		this.validate(version);
		return new PromptVersionId(version, promptEntityId);
	}

	toWhereClause<
		T extends {
			promptId: SQLiteColumn;
			version: SQLiteColumn;
			tenantId: SQLiteColumn;
			projectId: SQLiteColumn;
		}
	>(table: T): SQL {
		return and(
			eq(table.tenantId, this.tenantId),
			eq(table.projectId, this.projectId),
			eq(table.promptId, this.promptId),
			eq(table.version, this.version)
		)!;
	}
}
