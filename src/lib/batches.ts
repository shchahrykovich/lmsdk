export type BatchState = "draft" | "submitting" | "running" | "finished" | "failed" | "cancelled";

export type BatchItemStatus = "pending" | "succeeded" | "errored" | "expired" | "cancelled";

export type BatchStateFilter = "all" | "active" | BatchState;

export interface BatchCounts {
  total: number;
  pending: number;
  succeeded: number;
  errored: number;
  expired: number;
  cancelled: number;
}

export interface ProviderBatch {
  id: string | null;
  state: string;
  provider_status: string | null;
  items: number;
  error: string | null;
}

export interface Batch {
  id: number;
  state: BatchState;
  mode: "native" | "paced";
  discount: "batch" | "none";
  provider: string;
  model: string;
  version: number;
  prompt_id: number;
  prompt: { id: number; name: string | null; slug: string | null };
  metadata: Record<string, unknown>;
  counts: BatchCounts;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  cost: number;
  cost_complete: boolean;
  provider_batches: ProviderBatch[];
  cancel_requested: boolean;
  error: string | null;
  created_at: string;
  submitted_at: string | null;
  finished_at: string | null;
  results_expire_at: string | null;
}

export interface BatchItem {
  id: number;
  custom_id: string;
  status: BatchItemStatus;
  result: unknown;
  model: string | null;
  usage: Record<string, unknown> | null;
  error: { code: string; message: string } | null;
}

export interface BatchesPage {
  batches: Batch[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BatchDetails {
  batch: Batch;
  workflowStatus: string | null;
}

export interface BatchItemsPage {
  items: BatchItem[];
  nextCursor: string | null;
}

export const BATCH_STATE_FILTERS: { value: BatchStateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "finished", label: "Finished" },
  { value: "failed", label: "Failed" },
  { value: "cancelled", label: "Cancelled" },
];

export const BATCH_ITEM_STATUSES: BatchItemStatus[] = ["pending", "succeeded", "errored", "expired", "cancelled"];

const ACTIVE_STATES: readonly BatchState[] = ["submitting", "running"];

const STOPPED_RUN_STATUSES = ["errored", "terminated", "complete"];

export const isActiveBatch = (batch: Pick<Batch, "state">): boolean => ACTIVE_STATES.includes(batch.state);

export const isStuckBatch = (batch: Pick<Batch, "state">, workflowStatus: string | null): boolean =>
  isActiveBatch(batch) && workflowStatus !== null && STOPPED_RUN_STATUSES.includes(workflowStatus);

export const canCancelBatch = (batch: Pick<Batch, "state" | "cancel_requested">): boolean =>
  batch.state === "draft" || (isActiveBatch(batch) && !batch.cancel_requested);

export const canFinishBatch = (batch: Pick<Batch, "state">): boolean => isActiveBatch(batch);

export const completedPercent = (counts: BatchCounts): number =>
  counts.total === 0 ? 0 : Math.round(((counts.total - counts.pending) / counts.total) * 100);

const costText = (cost: number): string => {
  if (cost === 0) return "$0";
  return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`;
};

export const formatCost = (cost: number, complete = true): string => {
  const text = costText(cost);
  return complete ? text : `${text}+`;
};

export const stateFilterQuery = (filter: BatchStateFilter): Record<string, string> =>
  filter === "all" ? {} : { state: filter };

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${fallback}: ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function fetchBatches(projectId: number, params: URLSearchParams): Promise<BatchesPage> {
  return await readJson(await fetch(`/api/projects/${projectId}/batches?${params.toString()}`), "Failed to fetch batches");
}

export async function fetchBatch(projectId: number, batchId: number | string): Promise<BatchDetails> {
  return await readJson(await fetch(`/api/projects/${projectId}/batches/${batchId}`), "Failed to fetch batch");
}

export async function fetchBatchItems(
  projectId: number,
  batchId: number | string,
  options: { cursor?: string | null; status?: BatchItemStatus | null; limit?: number }
): Promise<BatchItemsPage> {
  const params = new URLSearchParams({ limit: String(options.limit ?? 50) });
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.status) params.set("status", options.status);
  return await readJson(
    await fetch(`/api/projects/${projectId}/batches/${batchId}/items?${params.toString()}`),
    "Failed to fetch batch items"
  );
}

export async function runBatchAction(
  projectId: number,
  batchId: number,
  action: "cancel" | "finish"
): Promise<BatchDetails> {
  return await readJson(
    await fetch(`/api/projects/${projectId}/batches/${batchId}/${action}`, { method: "POST" }),
    `Failed to ${action} batch`
  );
}
