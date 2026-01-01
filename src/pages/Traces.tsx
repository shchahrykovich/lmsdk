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
import { Clock, AlertCircle, CheckCircle2, Timer, Network as NetworkIcon } from "lucide-react";

interface Project {
  id: number;
  name: string;
  slug: string;
}

interface TraceEntry {
  id: number;
  traceId: string;
  totalLogs: number;
  successCount: number;
  errorCount: number;
  totalDurationMs: number;
  firstLogAt: number | string | null;
  lastLogAt: number | string | null;
  tracePath: string | null;
  createdAt: number | string;
  updatedAt: number | string;
}

interface TracesResponse {
  traces: TraceEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export default function Traces() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [tracesData, setTracesData] = useState<TracesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchProject();
  }, [slug]);

  // Fetch traces when project or URL params change
  useEffect(() => {
    if (project) {
      fetchTraces();
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

  const fetchTraces = async () => {
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

      const apiParams = new URLSearchParams({
        page,
        pageSize: perPage,
      });

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

      const tracesResponse = await fetch(
        `/api/projects/${project.id}/traces?${apiParams.toString()}`
      );

      if (!tracesResponse.ok) {
        throw new Error(`Failed to fetch traces: ${tracesResponse.statusText}`);
      }

      const data = await tracesResponse.json();
      setTracesData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load traces");
      console.error("Error fetching traces:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value: string | number | null) => {
    if (!value) return "—";
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

  const columns = useMemo<ColumnDef<TraceEntry>[]>(
    () => [
      {
        id: "traceId",
        accessorKey: "traceId",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Trace ID" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <NetworkIcon className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-sm">{row.original.traceId}</span>
          </div>
        ),
        enableColumnFilter: false,
      },
      {
        id: "totalLogs",
        accessorKey: "totalLogs",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Total Logs" />
        ),
        cell: ({ row }) => (
          <div className="text-muted-foreground">{row.original.totalLogs}</div>
        ),
        enableColumnFilter: false,
        enableSorting: true,
      },
      {
        id: "status",
        accessorFn: (row) => ({
          success: row.successCount,
          error: row.errorCount,
        }),
        header: "Status",
        cell: ({ row }) => {
          const { successCount, errorCount } = row.original;
          const hasErrors = errorCount > 0;
          return (
            <div className="flex gap-2">
              {successCount > 0 && (
                <Badge
                  variant="default"
                  className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100"
                >
                  <CheckCircle2 className="mr-1 h-3 w-3" />
                  {successCount}
                </Badge>
              )}
              {hasErrors && (
                <Badge
                  variant="destructive"
                  className="bg-red-100 text-red-700 hover:bg-red-100"
                >
                  <AlertCircle className="mr-1 h-3 w-3" />
                  {errorCount}
                </Badge>
              )}
            </div>
          );
        },
        enableColumnFilter: false,
        enableSorting: false,
      },
      {
        id: "totalDurationMs",
        accessorKey: "totalDurationMs",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Total Duration" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Timer className="h-3.5 w-3.5" />
            {typeof row.original.totalDurationMs === "number"
              ? `${row.original.totalDurationMs} ms`
              : "—"}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: true,
      },
      {
        id: "firstLogAt",
        accessorKey: "firstLogAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="First Log" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatDate(row.original.firstLogAt)}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: true,
      },
      {
        id: "lastLogAt",
        accessorKey: "lastLogAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Last Log" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatDate(row.original.lastLogAt)}
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: true,
      },
    ],
    []
  );

  const { table } = useDataTable({
    data: tracesData?.traces || [],
    columns,
    pageCount: tracesData?.totalPages || 0,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    getRowId: (row) => String(row.id),
    debounceMs: 0,
    shallow: false,
  });

  if (loading && !tracesData) {
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
        pageTitle="Traces"
        description="View trace aggregations and request flows"
        onBack={() => navigate(`/projects/${project.slug}`)}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="w-full space-y-4">
          {!tracesData || tracesData.traces.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground">No traces yet</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Traces will appear here once requests with trace IDs are recorded for this project.
              </p>
            </div>
          ) : (
            <>
              <DataTable
                table={table}
                onRowClick={(row, event) => {
                  const url = `/projects/${slug}/traces/${row.traceId}`;
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
