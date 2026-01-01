import { useEffect, useState, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { useDataTable } from "@/hooks/use-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Clock, AlertCircle, CheckCircle2, Timer } from "lucide-react";

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

interface PromptOption {
  promptId: number;
  promptName: string;
  version: number;
}

export default function Logs() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [logsData, setLogsData] = useState<LogsResponse | null>(null);
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [variablePathOptions, setVariablePathOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProject();
  }, [slug]);

  // Fetch prompts and variables only once when project loads
  useEffect(() => {
    if (project) {
      fetchPromptOptions();
      fetchVariablePathOptions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  // Fetch logs when project or URL params change
  useEffect(() => {
    if (project) {
      fetchLogs();
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

      // Build query string from URL params
      const params = new URLSearchParams(window.location.search);

      // Map data table params to API params
      const page = params.get("page") || "1";
      const perPage = params.get("perPage") || "10";
      const sort = params.get("sort");
      const filters = params.get("filters");

      // Check for direct filter params (alternative storage method)
      const directStatus = params.get("status");
      const directPrompt = params.get("prompt");

      const apiParams = new URLSearchParams({
        page,
        pageSize: perPage,
      });

      // Handle direct URL param filters (takes precedence over JSON filters)
      if (directStatus) {
        console.log("Found direct status param:", directStatus);
        apiParams.set("isSuccess", directStatus);
      }

      if (directPrompt) {
        console.log("Found direct prompt param:", directPrompt);
        const [promptId, version] = directPrompt.split("-");
        if (promptId && version) {
          apiParams.set("promptId", promptId);
          apiParams.set("version", version);
        }
      }

      // Parse and add sort parameters
      if (sort) {
        try {
          const sortArray = JSON.parse(sort);
          if (sortArray.length > 0) {
            const firstSort = sortArray[0];
            apiParams.set("sortField", firstSort.id);
            apiParams.set("sortDirection", firstSort.desc ? "desc" : "asc");
          }
        } catch (e) {
          console.error("Failed to parse sort:", e);
        }
      }

      // Parse and add filter parameters
      if (filters) {
        try {
          const filtersArray = JSON.parse(filters);
          console.log("Filters array:", filtersArray); // Debug log
          for (const filter of filtersArray) {
            console.log("Processing filter:", filter); // Debug log
            if (filter.id === "status") {
              // Select filter - value is an array of selected values
              console.log("Status filter value:", filter.value, "Type:", typeof filter.value, "IsArray:", Array.isArray(filter.value)); // Debug log
              // For status, we need to check if the array contains "true" or "false"
              if (Array.isArray(filter.value) && filter.value.length > 0) {
                // Only set if exactly one value is selected
                if (filter.value.length === 1) {
                  apiParams.set("isSuccess", filter.value[0]);
                }
                // If both true and false are selected, don't filter (show all)
              }
            } else if (filter.id === "prompt") {
              // Prompt filter - value is array of "promptId-version" strings
              if (Array.isArray(filter.value) && filter.value.length > 0) {
                // For now, only support single selection
                if (filter.value.length === 1) {
                  const [promptId, version] = filter.value[0].split("-");
                  apiParams.set("promptId", promptId);
                  apiParams.set("version", version);
                }
              }
            } else if (filter.id === "variables") {
              // Variables filter - object with path, value, and operator
              if (filter.value && typeof filter.value === "object") {
                const { path, value, operator } = filter.value;
                if (path) {
                  apiParams.set("variablePath", path);
                }
                // Always set value, even if empty (for "notEmpty" operator)
                if (value !== undefined) {
                  apiParams.set("variableValue", value);
                }
                if (operator) {
                  apiParams.set("variableOperator", operator);
                }
              }
            }
          }
        } catch (e) {
          console.error("Failed to parse filters:", e);
        }
      }

      console.log("Final API params:", apiParams.toString()); // Debug log

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

  const formatDate = (value: string | number) => {
    const timestamp =
      typeof value === "number" && value < 1_000_000_000_000 ? value * 1000 : value;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString();
  };

  const columns = useMemo<ColumnDef<LogEntry>[]>(
    () => [
      {
        id: "prompt",
        accessorKey: "promptName",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Prompt" />
        ),
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <div>
              <span className="font-medium text-foreground">
                {row.original.promptName || "Unknown prompt"}
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
        id: "status",
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
        id: "duration",
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
            {formatDate(row.original.createdAt)}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: true,
      },
    ],
    [promptOptions, variablePathOptions]
  );

  const { table } = useDataTable({
    data: logsData?.logs || [],
    columns,
    pageCount: logsData?.totalPages || 0,
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
    const filters: Array<{
      id: string;
      label: string;
      value: string;
      onRemove: () => void;
    }> = [];

    const columnFilters = table.getState().columnFilters;

    columnFilters.forEach((filter) => {
      const column = table.getColumn(filter.id);
      const columnMeta = column?.columnDef.meta;
      const label = columnMeta?.label || filter.id;

      if (filter.id === "status") {
        const value = Array.isArray(filter.value) ? filter.value : [filter.value];
        if (value.length === 1) {
          filters.push({
            id: `${filter.id}`,
            label,
            value: value[0] === "true" ? "Success" : "Error",
            onRemove: () => column?.setFilterValue(undefined),
          });
        }
      } else if (filter.id === "prompt") {
        const value = Array.isArray(filter.value) ? filter.value : [filter.value];
        if (value.length > 0) {
          const promptValue = value[0];
          const [promptId, version] = promptValue.split("-");
          const prompt = promptOptions.find(
            (p) => p.promptId === parseInt(promptId) && p.version === parseInt(version)
          );
          if (prompt) {
            filters.push({
              id: `${filter.id}`,
              label,
              value: `${prompt.promptName} v${prompt.version}`,
              onRemove: () => column?.setFilterValue(undefined),
            });
          }
        }
      } else if (filter.id === "variables") {
        const value = filter.value as { path?: string; value?: string; operator?: string };
        if (value?.path) {
          let displayValue: string;
          if (value.operator === "notEmpty") {
            displayValue = `${value.path} not empty`;
          } else if (value.value) {
            displayValue = `${value.path} contains "${value.value}"`;
          } else {
            displayValue = value.path;
          }
          filters.push({
            id: `${filter.id}`,
            label,
            value: displayValue,
            onRemove: () => column?.setFilterValue(undefined),
          });
        }
      }
    });

    return filters;
  }, [table, promptOptions]);


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
        <div className="text-red-500 mb-4">{error || "Project not found"}</div>
        <Button onClick={() => navigate("/projects")}>Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle="Logs"
        description={
          activeFilters.length > 0
            ? `Review recent activity and request logs • ${activeFilters.length} active filter${activeFilters.length > 1 ? "s" : ""}`
            : "Review recent activity and request logs"
        }
        onBack={() => navigate(`/projects/${project.slug}`)}
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
                    navigate(url);
                  }
                }}
              >
                <DataTableToolbar table={table} />
              </DataTable>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
