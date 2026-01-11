/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { AddLogsToDatasetDialog } from "@/components/AddLogsToDatasetDialog";
import { useDataTable } from "@/hooks/use-data-table";
import { usePaginationParams } from "@/hooks/use-pagination-params";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, CheckCircle2, Timer } from "lucide-react";
import {
  applyDirectFilters,
  applySortParams,
  buildPromptFilter,
  buildStatusFilter,
  buildVariablesFilter,
  formatLogDate,
  type ActiveFilter,
  type PromptOption,
} from "@/pages/logs/logs-utils";

interface Project {
  id: number;
  name: string;
  slug: string;
}

interface LogEntry {
  id: number;
  promptId: number;
  version: number;
  logPath: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: number | string;
  promptName: string | null;
  promptSlug: string | null;
  provider: string | null;
  model: string | null;
}

interface LogsResponse {
  logs: LogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function Logs(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { buildApiParams } = usePaginationParams();
  const [project, setProject] = useState<Project | null>(null);
  const [logsData, setLogsData] = useState<LogsResponse | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [variablePathOptions, setVariablePathOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  useEffect(() => {
    void fetchProject();
  }, [slug]);

  // Fetch prompts and variables only once when project loads
  useEffect(() => {
    if (project) {
      void fetchPromptOptions();
      void fetchVariablePathOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // Fetch logs when project or URL params change
  useEffect(() => {
    if (project) {
      void fetchLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, location.search]);

  const fetchProject = async () => {
    try {
      setError(null);
      const response = await fetch("/api/projects");

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      const foundProject = data.projects.find((p: Project) => p.slug === slug);

      if (!foundProject) {
        setError("Project not found");
        return;
      }

      setProject(foundProject);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
      console.error("Error fetching project:", err);
    }
  };

  const fetchPromptOptions = async () => {
    if (!project) return;

    try {
      const response = await fetch(`/api/projects/${project.id}/logs/prompts`);
      if (!response.ok) {
        throw new Error(`Failed to fetch prompts: ${response.statusText}`);
      }

      const data = await response.json();
      setPromptOptions(data.prompts);
    } catch (err) {
      console.error("Error fetching prompt options:", err);
    }
  };

  const fetchVariablePathOptions = async () => {
    if (!project) return;

    try {
      const response = await fetch(`/api/projects/${project.id}/logs/variables`);
      if (!response.ok) {
        throw new Error(`Failed to fetch variable paths: ${response.statusText}`);
      }

      const data = await response.json();
      setVariablePathOptions(data.variablePaths);
    } catch (err) {
      console.error("Error fetching variable path options:", err);
    }
  };

  const fetchLogs = async () => {
    if (!project) return;

    try {
      setLoading(true);
      setError(null);

      const apiParams = buildApiParams();

      // Apply additional filters and sorting from URL params
      const params = new URLSearchParams(window.location.search);
      applyDirectFilters(params, apiParams);
      applySortParams(params, apiParams);

      const logsResponse = await fetch(
        `/api/projects/${project.id}/logs?${apiParams.toString()}`
      );

      if (!logsResponse.ok) {
        throw new Error(`Failed to fetch logs: ${logsResponse.statusText}`);
      }

      const data = await logsResponse.json();
      setLogsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
      console.error("Error fetching logs:", err);
    } finally {
      setLoading(false);
    }
  };

  const columns = useMemo<ColumnDef<LogEntry>[]>(
    () => [
      {
        id: "select",
        header: ({ table }) => (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              className="h-4 w-4 accent-foreground"
              checked={table.getIsAllPageRowsSelected()}
              ref={(input) => {
                if (input) {
                  input.indeterminate =
                    table.getIsSomePageRowsSelected() &&
                    !table.getIsAllPageRowsSelected();
                }
              }}
              onChange={(event) =>
                table.toggleAllPageRowsSelected(event.target.checked)
              }
              onClick={(event) => event.stopPropagation()}
              aria-label="Select all logs"
            />
          </div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              className="h-4 w-4 accent-foreground"
              checked={row.getIsSelected()}
              onChange={(event) => row.toggleSelected(event.target.checked)}
              onClick={(event) => event.stopPropagation()}
              aria-label="Select log"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        id: "promptName",
        accessorKey: "promptName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Prompt" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <div>
              <span className="font-medium text-foreground">
                {row.original.promptName ?? "Unknown prompt"}
              </span>
              {" "}
              <span className="text-xs text-muted-foreground">
                v{row.original.version}
              </span>
            </div>
            {!row.original.isSuccess && row.original.errorMessage && (
              <div className="text-xs text-red-500">
                {row.original.errorMessage}
              </div>
            )}
          </div>
        ),
        meta: {
          label: "Prompt",
          variant: "select",
          options: promptOptions.map((p) => ({
            label: `${p.promptName}-v${p.version}`,
            value: `${p.promptId}-${p.version}`,
          })),
        },
        enableColumnFilter: true,
        filterFn: (row, _id, value) => {
          // value is array of "promptId-version" strings
          if (!Array.isArray(value) || value.length === 0) return true;
          return value.some((v) => {
            const [promptId, version] = v.split("-");
            return (
              row.original.promptId === parseInt(promptId) &&
              row.original.version === parseInt(version)
            );
          });
        },
      },
      {
        id: "isSuccess",
        accessorKey: "isSuccess",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Status" />
        ),
        cell: ({ row }) => {
          const isSuccess = row.original.isSuccess;
          return (
            <Badge
              variant={isSuccess ? "default" : "destructive"}
              className={
                isSuccess
                  ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                  : "bg-red-100 text-red-700 hover:bg-red-100"
              }
            >
              {isSuccess ? (
                <>
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  Success
                </>
              ) : (
                <>
                  <AlertCircle className="mr-1 h-3 w-3" />
                  Error
                </>
              )}
            </Badge>
          );
        },
        meta: {
          label: "Status",
          variant: "select",
          options: [
            { label: "Success", value: "true" },
            { label: "Error", value: "false" },
          ],
        },
        enableColumnFilter: true,
        filterFn: (row, id, value) => {
          return value.includes(String(row.getValue(id)));
        },
      },
      {
        id: "variables",
        accessorFn: () => "", // Dummy accessor for filter-only column
        header: "Variables",
        cell: () => null,
        meta: {
          label: "Variables",
          variant: "custom",
          filterComponent: "variablesDialog",
          variablePaths: variablePathOptions,
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: true,
        filterFn: () => true, // Filtering handled server-side
      },
      {
        id: "provider",
        accessorFn: (row) =>
          row.provider && row.model ? `${row.provider}/${row.model}` : "Unknown",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Provider" />
        ),
        cell: ({ row }) => (
          <div className="text-muted-foreground">
            {row.original.provider && row.original.model
              ? `${row.original.provider}/${row.original.model}`
              : "Unknown"}
          </div>
        ),
        enableColumnFilter: false,
      },
      {
        id: "durationMs",
        accessorKey: "durationMs",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Duration" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            {typeof row.original.durationMs === "number"
              ? `${row.original.durationMs} ms`
              : "—"}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: true,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Time" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatLogDate(row.original.createdAt)}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: true,
      },
    ],
    [promptOptions, variablePathOptions]
  );

  const { table } = useDataTable({
    data: logsData?.logs ?? [],
    columns,
    pageCount: logsData?.totalPages ?? 0,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
      columnVisibility: {
        variables: false, // Hide variables column from table view (filter only)
      },
    },
    getRowId: (row) => String(row.id),
    debounceMs: 0, // Disable debounce for immediate URL updates
    shallow: false, // Force full navigation to trigger location change
  });

  // Extract active filters for display
  const activeFilters = useMemo(() => {
    const columnFilters = table.getState().columnFilters;

    return columnFilters.reduce<ActiveFilter[]>((filters, filter) => {
      const column = table.getColumn(filter.id);
      const label = column?.columnDef.meta?.label ?? filter.id;
      const onRemove = () => column?.setFilterValue(undefined);
      let nextFilter: ActiveFilter | null = null;

      if (filter.id === "isSuccess") {
        nextFilter = buildStatusFilter(filter.value, label, onRemove);
      } else if (filter.id === "promptName") {
        nextFilter = buildPromptFilter(filter.value, label, onRemove, promptOptions);
      } else if (filter.id === "variables") {
        nextFilter = buildVariablesFilter(filter.value, label, onRemove);
      }

      if (nextFilter) {
        filters.push(nextFilter);
      }
      return filters;
    }, []);
  }, [table, promptOptions]);

  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;
  const selectedLogIds = table.getSelectedRowModel().rows.map((row) => row.original.id);


  if (loading && !logsData) {
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
        <Button onClick={() => { void navigate("/projects"); }}>Back to Projects</Button>
      </div>
    );
  }

  let pageDescription = "Review recent activity and request logs";

  if (activeFilters.length > 0) {
    pageDescription = `Review recent activity and request logs • ${activeFilters.length} active filter${
      activeFilters.length > 1 ? "s" : ""
    }`;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle="Logs"
        description={pageDescription}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="w-full space-y-4">
          {!logsData ? (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground">No logs yet</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Logs will appear here once requests are recorded for this project.
              </p>
            </div>
          ) : (
            <>
              <DataTable
                table={table}
                onRowClick={(row, event) => {
                  const url = `/projects/${slug}/logs/${row.id}`;
                  // Check if Cmd (Mac) or Ctrl (Windows/Linux) key is pressed
                  if (event?.metaKey || event?.ctrlKey) {
                    // Open in new tab
                    window.open(url, '_blank');
                  } else {
                    // Normal navigation
                    void navigate(url);
                  }
                }}
              >
                <DataTableToolbar table={table}>
                  {selectedRowCount > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        {selectedRowCount} selected
                      </span>
                      <Button size="sm" onClick={() => setIsAddDialogOpen(true)}>
                        Add to dataset
                      </Button>
                    </div>
                  )}
                </DataTableToolbar>
              </DataTable>
            </>
          )}
        </div>
      </div>

      {project && (
        <AddLogsToDatasetDialog
          projectId={project.id}
          logIds={selectedLogIds}
          open={isAddDialogOpen}
          onOpenChange={setIsAddDialogOpen}
          onSuccess={() => table.resetRowSelection()}
        />
      )}
    </div>
  );
}
