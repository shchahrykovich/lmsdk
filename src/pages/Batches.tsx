/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/Pagination";
import BatchStateBadge from "@/components/batches/BatchStateBadge";
import BatchProgress from "@/components/batches/BatchProgress";
import BatchActionButtons from "@/components/batches/BatchActionButtons";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import {
  BATCH_STATE_FILTERS,
  fetchBatches,
  formatCost,
  isActiveBatch,
  stateFilterQuery,
  type BatchStateFilter,
  type BatchesPage,
} from "@/lib/batches";

const REFRESH_MS = 10_000;

const HEADER = "px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider";

interface Project {
  id: number;
  name: string;
  slug: string;
}

export default function Batches(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { buildApiParams } = usePaginationParams({ defaultPageSize: "20" });
  const [project, setProject] = useState<Project | null>(null);
  const [data, setData] = useState<BatchesPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const filter = (searchParams.get("state") ?? "all") as BatchStateFilter;

  const loadBatches = async (projectId: number) => {
    setData(await fetchBatches(projectId, buildApiParams(stateFilterQuery(filter))));
  };

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
        await loadBatches(found.id);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [slug, location.search]);

  const hasActive = data?.batches.some(isActiveBatch) ?? false;

  useEffect(() => {
    if (!project || !hasActive) return;
    const timer = setInterval(() => {
      void loadBatches(project.id).catch((refreshError: unknown) => {
        console.error("Error refreshing batches:", refreshError);
      });
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [project, hasActive, location.search]);

  const selectFilter = (value: BatchStateFilter) => {
    setSearchParams(value === "all" ? {} : { state: value });
  };

  const openBatch = (event: React.MouseEvent, batchId: number) => {
    const path = `/projects/${slug}/batches/${batchId}`;
    if (event.metaKey || event.ctrlKey) {
      window.open(path, "_blank");
      return;
    }
    event.preventDefault();
    void navigate(path);
  };

  if (loading && !data) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error ?? "Project not found"}</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle="Batches"
        description="Batch runs of the prompts in this project. Cancel a batch, or finish a stuck one by hand."
      />

      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {BATCH_STATE_FILTERS.map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? "default" : "outline"}
              size="sm"
              onClick={() => selectFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {actionError && <div className="text-sm text-red-600 dark:text-red-400">{actionError}</div>}

        {!data || data.batches.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">No batches</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Batches are created through the API: POST /api/v1/projects/{"{project}"}/prompts/{"{prompt}"}/batches.
            </p>
          </div>
        ) : (
          <>
            <div className="border border-border rounded-lg overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className={HEADER}>Batch</th>
                    <th className={HEADER}>Prompt</th>
                    <th className={HEADER}>Model</th>
                    <th className={HEADER}>State</th>
                    <th className={HEADER}>Progress</th>
                    <th className={HEADER}>Cost</th>
                    <th className={HEADER}>Created</th>
                    <th className={HEADER}>Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-card divide-y divide-border">
                  {data.batches.map((batch) => (
                    <tr
                      key={batch.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={(event) => openBatch(event, batch.id)}
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <a
                          href={`/projects/${slug}/batches/${batch.id}`}
                          onClick={(event) => {
                            event.stopPropagation();
                            openBatch(event, batch.id);
                          }}
                          className="text-sm font-medium text-foreground hover:underline"
                        >
                          #{batch.id}
                        </a>
                        <div className="text-xs text-muted-foreground">{batch.mode}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {batch.prompt.name ?? `Prompt ${batch.prompt.id}`}
                        <span className="text-muted-foreground"> v{batch.version}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {batch.provider} / {batch.model}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <BatchStateBadge state={batch.state} />
                          {batch.cancel_requested && isActiveBatch(batch) && (
                            <span className="text-xs text-muted-foreground">cancelling</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <BatchProgress counts={batch.counts} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {formatCost(batch.cost, batch.cost_complete)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(batch.created_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <BatchActionButtons
                          projectId={project.id}
                          batch={batch}
                          onChanged={() => {
                            setActionError(null);
                            void loadBatches(project.id);
                          }}
                          onError={setActionError}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination currentPage={data.page} totalPages={data.totalPages} pageSize={data.pageSize} />
          </>
        )}
      </div>
    </div>
  );
}
