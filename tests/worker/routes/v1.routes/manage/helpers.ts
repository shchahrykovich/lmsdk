import { env } from "cloudflare:test";
import { vi } from "vitest";
import app from "../../../../../worker/index";
import { applyMigrations } from "../../../helpers/db-setup";
import { seedDataSet, seedProject, seedPrompt } from "../../../helpers/seed";
import { ProjectId } from "../../../../../worker/shared/project-id";
import { EntityId } from "../../../../../worker/shared/entity-id";
import type { Batch } from "../../../../../worker/db/schema";
import { createApiKeyForUser, setupApiKeyUser } from "../helpers";
import { FakeBatchAdapter, createBatchService } from "../../../batches/batch-fixtures";

export const MODEL = "gpt-5-nano";

export const validBody = {
  messages: [
    { role: "system", content: "Classify the ticket." },
    { role: "user", content: "{{ticket}}" },
  ],
};

export const createWorkflowMock = (status = "running") => ({
  create: vi.fn(async ({ params }: { params: { evaluationId: number } }) => ({ id: `wf-${params.evaluationId}` })),
  get: vi.fn(async () => ({ status: async () => ({ status }) })),
});

export type WorkflowMock = ReturnType<typeof createWorkflowMock>;

export const createBatchWorkflowMock = (status = "running") => {
  const terminate = vi.fn(async () => undefined);
  return {
    create: vi.fn(async ({ id }: { id: string }) => ({ id })),
    get: vi.fn(async () => ({ status: async () => ({ status }), terminate })),
    terminate,
  };
};

export type BatchWorkflowMock = ReturnType<typeof createBatchWorkflowMock>;

export async function seedSubmittedBatch(tenantId: number, projectId: number, promptId: number): Promise<Batch> {
  const { service } = createBatchService(new FakeBatchAdapter());
  const prompt = new EntityId(promptId, new ProjectId(projectId, tenantId, "seed"));
  const { batch } = await service.createBatch(prompt, {});
  const batchId = new EntityId(batch.id, prompt.getProjectId());
  await service.addItems(batchId, [{ custom_id: "ticket-1", variables: { ticket: "x" } }]);
  return await service.submit(batchId);
}

const executionCtx = {
  waitUntil: (promise: Promise<unknown>) => promise,
  passThroughOnException: () => {},
  props: {},
};

export const manage = (
  path: string,
  key: string | undefined,
  options: { method?: string; body?: unknown; workflow?: WorkflowMock; batchWorkflow?: BatchWorkflowMock } = {}
) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (key !== undefined) {
    headers.set("x-api-key", key);
  }
  return app.request(
    `/api/v1/manage${path}`,
    {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    },
    {
      ...env,
      EVALUATION_WORKFLOW: options.workflow ?? createWorkflowMock(),
      BATCH_WORKFLOW: options.batchWorkflow ?? createBatchWorkflowMock(),
    },
    executionCtx as unknown as ExecutionContext
  );
};

export type Fixtures = Awaited<ReturnType<typeof setupFixtures>>;

export async function setupFixtures() {
  await applyMigrations();

  const tenant1 = await setupApiKeyUser(1, { manage: ["read", "write"] });
  const tenant2 = await setupApiKeyUser(2, { manage: ["read", "write"] });
  const keys = {
    write: tenant1.testApiKey,
    read: await createApiKeyForUser(tenant1.testUser.id, { manage: ["read"] }),
    old: await createApiKeyForUser(tenant1.testUser.id),
    otherTenant: tenant2.testApiKey,
  };

  const seedTenant = async (tenantId: number) => {
    const project = await seedProject(tenantId, "support");
    const projectId = new ProjectId(project.id, tenantId, "seed");
    const prompt = await seedPrompt(projectId, "classifier");
    const dataSet = await seedDataSet(projectId, "Tickets");
    return { project, prompt: prompt.prompt, versionIds: prompt.versionIds, dataSet };
  };

  return { keys, tenant1: await seedTenant(1), tenant2: await seedTenant(2) };
}
