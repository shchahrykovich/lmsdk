/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import BatchStateBadge from "@/components/batches/BatchStateBadge";
import BatchProgress from "@/components/batches/BatchProgress";
import BatchActionButtons from "@/components/batches/BatchActionButtons";
import BatchItemsTable from "@/components/batches/BatchItemsTable";
import ProviderBatchesTable from "@/components/batches/ProviderBatchesTable";
import { fetchBatch, formatCost, isActiveBatch, isStuckBatch, type BatchDetails } from "@/lib/batches";

const REFRESH_MS = 10_000;

interface Project {
  id: number;
  name: string;
  slug: string;
}

const formatTime = (value: string | null): string => (value ? new Date(value).toLocaleString() : "—");

function Field({ label, children }: Readonly<{ label: string; children: React.ReactNode }>): React.ReactNode {
  return (
    <div>
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-sm text-foreground mt-1">{children}</div>
    </div>
  );
}

export default function BatchDetail(): React.ReactNode {
  const { slug, batchId } = useParams<{ slug: string; batchId: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [details, setDetails] = useState<BatchDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [itemsRefreshKey, setItemsRefreshKey] = useState(0);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/projects");
        if (!response.ok) {
          throw new Error(`Failed to fetch projects: ${response.statusText}`);
        }
        const found = ((await response.json()) as { projects: Project[] }).projects.find((p) => p.slug === slug);
        if (!found) {
          setError("Project not found");
          return;
        }
        setProject(found);
        setDetails(await fetchBatch(found.id, batchId ?? ""));
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [slug, batchId]);

  const isActive = details ? isActiveBatch(details.batch) : false;

  useEffect(() => {
    if (!project || !isActive) return;
    const timer = setInterval(() => {
      void fetchBatch(project.id, batchId ?? "")
        .then(setDetails)
        .catch((refreshError: unknown) => console.error("Error refreshing batch:", refreshError));
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [project, isActive, batchId]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !project || !details) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error ?? "Batch not found"}</div>
      </div>
    );
  }

  const { batch, workflowStatus } = details;
  const stuck = isStuckBatch(batch, workflowStatus);
  const promptName = batch.prompt.name ?? "Prompt " + String(batch.prompt.id);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle={`Batch #${batch.id}`}
        description={`${promptName} v${batch.version} · ${batch.provider} / ${batch.model} · ${batch.mode}`}
        badge={<BatchStateBadge state={stuck ? "stuck" : batch.state} />}
        actions={
          <BatchActionButtons
            projectId={project.id}
            batch={batch}
            size="default"
            onChanged={(next) => {
              setActionError(null);
              setDetails(next);
              setItemsRefreshKey((key) => key + 1);
            }}
            onError={setActionError}
          />
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        {actionError && <div className="text-sm text-red-600 dark:text-red-400">{actionError}</div>}

        {stuck && (
          <div className="flex gap-3 rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-foreground">
            <AlertTriangle size={18} className="shrink-0 text-red-600 dark:text-red-400" />
            <div>
              The batch is {batch.state}, but its background run is {workflowStatus}. Nothing will move it forward.
              Use <span className="font-medium">Finish now</span> to end it and keep the results that already arrived.
            </div>
          </div>
        )}

        {batch.error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-sm text-foreground break-words">
            {batch.error}
          </div>
        )}

        <div className="rounded-lg border border-border bg-card p-6 grid grid-cols-2 md:grid-cols-4 gap-6">
          <Field label="Progress">
            <BatchProgress counts={batch.counts} />
          </Field>
          <Field label="Items">
            {batch.counts.succeeded} succeeded · {batch.counts.errored} errored · {batch.counts.expired} expired ·{" "}
            {batch.counts.cancelled} cancelled · {batch.counts.pending} pending
          </Field>
          <Field label="Cost">
            {formatCost(batch.cost, batch.cost_complete)}
            <span className="text-muted-foreground"> ({batch.discount === "batch" ? "batch price" : "full price"})</span>
          </Field>
          <Field label="Tokens">
            {batch.usage.total_tokens.toLocaleString()}
            <span className="text-muted-foreground">
              {" "}
              ({batch.usage.prompt_tokens.toLocaleString()} in / {batch.usage.completion_tokens.toLocaleString()} out)
            </span>
          </Field>
          <Field label="Background run">
            {workflowStatus ?? "not started"}
            {batch.cancel_requested && isActiveBatch(batch) && <span className="text-muted-foreground"> · cancelling</span>}
          </Field>
          <Field label="Created">{formatTime(batch.created_at)}</Field>
          <Field label="Submitted">{formatTime(batch.submitted_at)}</Field>
          <Field label="Finished">{formatTime(batch.finished_at)}</Field>
        </div>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Provider batches</h2>
          <ProviderBatchesTable batches={batch.provider_batches} />
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-foreground">Items</h2>
          <BatchItemsTable projectId={project.id} batchId={batch.id} refreshKey={itemsRefreshKey} />
        </section>
      </div>
    </div>
  );
}
