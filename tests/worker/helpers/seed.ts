import { env } from "cloudflare:test";
import { drizzle } from "drizzle-orm/d1";
import { PromptService } from "../../../worker/prompts/prompt.service";
import { DataSetService } from "../../../worker/datasets/dataset.service";
import { ProjectService } from "../../../worker/projects/project.service";
import {
  dataSetRecords,
  evaluationPrompts,
  type DataSet,
  type DataSetRecord,
  type EvaluationPrompt,
  type NewDataSetRecord,
  type NewEvaluationPrompt,
  type Project,
  type Prompt,
} from "../../../worker/db/schema";
import { ProjectId } from "../../../worker/shared/project-id";
import { EntityId } from "../../../worker/shared/entity-id";

export const validPromptBody = JSON.stringify({
  messages: [{ role: "user", content: "Say {{word}}" }],
});

export async function seedProject(tenantId: number, slug: string): Promise<Project> {
  return await new ProjectService(drizzle(env.DB)).createProject({
    name: `Project ${slug}`,
    slug,
    tenantId,
  });
}

export async function seedPrompt(
  projectId: ProjectId,
  slug: string,
  extraVersions = 0
): Promise<{ prompt: Prompt; versionIds: number[] }> {
  const service = new PromptService(drizzle(env.DB));
  const prompt = await service.createPrompt(projectId, {
    name: `Prompt ${slug}`,
    slug,
    provider: "openai",
    model: "gpt-4o-mini",
    body: validPromptBody,
  });
  const promptId = new EntityId(prompt.id, projectId);
  for (let i = 0; i < extraVersions; i++) {
    await service.updatePrompt(promptId, { body: validPromptBody });
  }
  const versions = await service.listPromptVersions(promptId);
  return {
    prompt,
    versionIds: versions.sort((a, b) => a.version - b.version).map((v) => v.id),
  };
}

export async function seedDataSet(projectId: ProjectId, name: string): Promise<DataSet> {
  return await new DataSetService(env.DB).createDataSet(
    { tenantId: projectId.tenantId, projectId: projectId.id },
    { name }
  );
}

export async function countRows(table: string): Promise<number> {
  const row = await env.DB.prepare(`SELECT COUNT(*) as count FROM ${table}`).first<{ count: number }>();
  return row?.count ?? 0;
}

export async function insertDataSetRecords(records: NewDataSetRecord[]): Promise<DataSetRecord[]> {
  return await drizzle(env.DB).insert(dataSetRecords).values(records).returning();
}

export async function insertEvaluationPrompts(records: NewEvaluationPrompt[]): Promise<EvaluationPrompt[]> {
  return await drizzle(env.DB).insert(evaluationPrompts).values(records).returning();
}
