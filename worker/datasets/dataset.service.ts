import { drizzle } from "drizzle-orm/d1";
import type { DataSet, DataSetRecord } from "../db/schema.ts";
import { DataSetRepository } from "./dataset.repository.ts";
import { DataSetRecordRepository } from "./dataset-record.repository.ts";
import type { TenantProjectContext, Pagination, PaginatedResult } from "../types/common.ts";
import { LogService } from "../logs/logs.service.ts";
import type {ProjectId} from "../shared/project-id";
import type {EntityId} from "../shared/entity-id";
import { ClientInputValidationError, conflictOnDuplicate, NotFoundError } from "../shared/errors.ts";
import { MAX_RECORDS_PER_CALL } from "./dataset-limits.ts";

const SCHEMA_MERGE_ATTEMPTS = 5;

interface AddLogsInput {
  logIds: number[];
}

type DataSetSchema = {
  fields: Record<string, { type: string }>;
};

export interface CreateDataSetInput {
  name: string;
  schema?: string;
}

export class DataSetService {
  private repository: DataSetRepository;
  private recordRepository: DataSetRecordRepository;
  private logService?: LogService;

  constructor(db: D1Database, r2?: R2Bucket) {
    this.repository = new DataSetRepository(db);
    this.recordRepository = new DataSetRecordRepository(db);
    if (r2) {
      this.logService = new LogService(drizzle(db), r2, db);
    }
  }

  async getDataSets(projectId: ProjectId): Promise<DataSet[]> {
    return await this.repository.findByTenantAndProject(projectId);
  }

  async getDataSetById(dataSetId: EntityId): Promise<DataSet | undefined> {
    return await this.repository.findById(dataSetId);
  }

  async getDataSetBySlug(projectId: ProjectId, slug: string): Promise<DataSet | undefined> {
    return await this.repository.findBySlug({ tenantId: projectId.tenantId, projectId: projectId.id, slug });
  }


  async createDataSet(context: TenantProjectContext, input: CreateDataSetInput): Promise<DataSet> {
    const baseSlug = this.generateSlug(input.name);
    let slug = baseSlug;
    let attempt = 1;

    while (await this.repository.findBySlug({ ...context, slug })) {
      attempt += 1;
      slug = `${baseSlug}-${attempt}`;
    }

    return await conflictOnDuplicate(
      () =>
        this.repository.create({
          tenantId: context.tenantId,
          projectId: context.projectId,
          name: input.name,
          slug,
          isDeleted: false,
          countOfRecords: 0,
          schema: input.schema ?? "{}",
        }),
      "A dataset with this name already exists"
    );
  }

  async deleteDataSet(entityId: EntityId): Promise<void> {
    await this.repository.softDelete(entityId);
  }

  async addLogsToDataSet(
    entityId: EntityId,
    input: AddLogsInput
  ): Promise<{ added: number; skipped: number }> {
    const dataset = await this.repository.findById(entityId);
    if (!dataset) {
      throw new Error("Dataset not found");
    }

    if (!this.logService) {
      throw new Error("Log service unavailable");
    }

    const variablesList: Record<string, unknown>[] = [];
    let skipped = 0;

    const results = await Promise.allSettled(
      input.logIds.map((logId) =>
        this.logService!.getLogVariables(entityId.tenantId, entityId.projectId, logId)
      )
    );

    for (const result of results) {
      if (result.status === "rejected" || !result.value) {
        skipped += 1;
        continue;
      }

      variablesList.push(result.value);
    }

    if (variablesList.length > 0) {
      await this.saveRecords(entityId, dataset, variablesList);
    }

    return { added: variablesList.length, skipped };
  }

  async listDataSetRecords(entityId: EntityId): Promise<DataSetRecord[]> {
    return await this.recordRepository.listByDataSet(entityId);
  }

  async listDataSetRecordsPaginated(
    entityId: EntityId,
    pagination: Pagination
  ): Promise<PaginatedResult<DataSetRecord>> {
    const { records, total } = await this.recordRepository.listByDataSetPaginated(
      entityId,
      pagination
    );

    const totalPages = Math.ceil(total / pagination.pageSize);

    return {
      records,
      total,
      page: pagination.page,
      pageSize: pagination.pageSize,
      totalPages,
    };
  }

  async createDataSetRecord(
    entityId: EntityId,
    variables: Record<string, unknown>
  ): Promise<DataSetRecord> {
    const dataset = await this.repository.findById(entityId);
    if (!dataset) {
      throw new NotFoundError("Dataset not found");
    }

    const [record] = await this.saveRecords(entityId, dataset, [variables]);
    return record;
  }

  async createDataSetRecords(
    entityId: EntityId,
    variablesList: Record<string, unknown>[]
  ): Promise<DataSetRecord[]> {
    if (variablesList.length === 0 || variablesList.length > MAX_RECORDS_PER_CALL) {
      throw new ClientInputValidationError(`Send between 1 and ${MAX_RECORDS_PER_CALL} records`);
    }

    const dataset = await this.repository.findById(entityId);
    if (!dataset) {
      throw new NotFoundError("Dataset not found");
    }

    return await this.saveRecords(entityId, dataset, variablesList);
  }

  private async saveRecords(
    entityId: EntityId,
    dataset: DataSet,
    variablesList: Record<string, unknown>[]
  ): Promise<DataSetRecord[]> {
    const { records, schemaSaved } = await this.repository.addRecords(
      entityId,
      variablesList.map((variables) => JSON.stringify(variables)),
      this.schemaWith(dataset.schema, variablesList),
      dataset.schema
    );

    if (!schemaSaved) {
      await this.mergeSchemaAfterConflict(entityId, variablesList);
    }

    return records;
  }

  private async mergeSchemaAfterConflict(
    entityId: EntityId,
    variablesList: Record<string, unknown>[]
  ): Promise<void> {
    for (let attempt = 0; attempt < SCHEMA_MERGE_ATTEMPTS; attempt++) {
      const current = await this.repository.findById(entityId);
      if (!current) {
        return;
      }
      const merged = this.schemaWith(current.schema, variablesList);
      if (await this.repository.replaceSchema(entityId, current.schema, merged)) {
        return;
      }
    }
    console.error("Dataset schema was not updated after concurrent writes", { dataSetId: entityId.id });
  }

  private schemaWith(currentSchema: string, variablesList: Record<string, unknown>[]): string {
    const schema = this.parseSchema(currentSchema);
    for (const variables of variablesList) {
      this.mergeSchema(schema, variables);
    }
    return JSON.stringify(schema);
  }

  async deleteDataSetRecords(
    entityId: EntityId,
    recordIds: number[]
  ): Promise<{ deleted: number }> {
    const deleted = await this.recordRepository.softDeleteMany(
      entityId,
      recordIds
    );

    if (deleted > 0) {
      await this.repository.incrementRecordCountBy(entityId, -deleted);
    }

    return { deleted };
  }

  private parseSchema(value: string): DataSetSchema {
    if (!value) {
      return { fields: {} };
    }

    try {
      const getFieldType = (field: unknown): string | null => {
        if (typeof field === "string") {
          return field;
        }
        if (!field || typeof field !== "object" || !("type" in field)) {
          return null;
        }
        const typeValue = (field as { type?: unknown }).type;
        if (typeof typeValue === "string") return typeValue;
        if (typeof typeValue === "number") return String(typeValue);
        return "unknown";
      };

      const parsed = JSON.parse(value) as unknown;
      if (!parsed || typeof parsed !== "object") {
        return { fields: {} };
      }

      const parsedFields = (parsed as DataSetSchema).fields;
      if (parsedFields && typeof parsedFields === "object") {
        return {
          fields: { ...parsedFields },
        };
      }

      const fields: Record<string, { type: string }> = {};
      for (const [key, field] of Object.entries(parsed as Record<string, unknown>)) {
        const type = getFieldType(field);
        if (!type) continue;
        fields[key] = { type };
      }
      return { fields };
    } catch {
      return { fields: {} };
    }

    return { fields: {} };
  }

  private mergeSchema(schema: DataSetSchema, variables: Record<string, unknown>) {
    const fields = this.collectFields(variables);
    for (const [path, type] of Object.entries(fields)) {
      const existing = schema.fields[path];
      if (!existing) {
        schema.fields[path] = { type };
      } else if (existing.type !== type && existing.type !== "mixed") {
        schema.fields[path] = { type: "mixed" };
      }
    }
  }

  private collectFields(value: unknown, prefix = ""): Record<string, string> {
    const fields: Record<string, string> = {};
    const path = prefix || "value";

    if (value === null) {
      fields[path] = "null";
      return fields;
    }

    if (Array.isArray(value)) {
      fields[path] = "array";
      return fields;
    }

    if (typeof value === "object") {
      const entries = Object.entries(value as Record<string, unknown>);
      if (entries.length === 0 && prefix) {
        fields[path] = "object";
        return fields;
      }
      for (const [key, next] of entries) {
        const nextPrefix = prefix ? `${prefix}.${key}` : key;
        Object.assign(fields, this.collectFields(next, nextPrefix));
      }
      return fields;
    }

    fields[path] = typeof value;
    return fields;
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .split(/[^a-z0-9]/)
      .filter(Boolean)
      .join("-");
  }
}
