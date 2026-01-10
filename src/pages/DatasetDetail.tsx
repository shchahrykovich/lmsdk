/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { AddRecordDialog } from "@/components/AddRecordDialog";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar";
import { DataTableColumnHeader } from "@/components/data-table/data-table-column-header";
import { useDataTable } from "@/hooks/use-data-table";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/ConfirmDialog";

interface Project {
  id: number;
  name: string;
  slug: string;
}

interface DataSet {
  id: number;
  projectId: number;
  tenantId: number;
  name: string;
  slug: string;
  isDeleted: boolean;
  countOfRecords: number;
  schema: string;
  createdAt: string;
  updatedAt: string;
}

interface DataSetRecord {
  id: number;
  tenantId: number;
  projectId: number;
  dataSetId: number;
  variables: Record<string, unknown>;
  createdAt: number | string;
  updatedAt: number | string;
}

interface RecordsResponse {
  records: DataSetRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

type SchemaFields = Record<string, { type: string }>;

const formatDate = (timestamp: string | number) => {
  const date =
    typeof timestamp === "number" && timestamp < 1_000_000_000_000
      ? new Date(timestamp * 1000)
      : new Date(timestamp);
  return date.toLocaleDateString();
};

const parseSchemaFields = (schema: string): SchemaFields => {
  if (!schema) return {};
  try {
    const parsed = JSON.parse(schema) as unknown;
    if (!parsed || typeof parsed !== "object") return {};

    const parsedFields = (parsed as { fields?: unknown }).fields;
    if (parsedFields && typeof parsedFields === "object") {
      return (parsed as { fields: SchemaFields }).fields ?? {};
    }

    const fields: SchemaFields = {};
    const toFieldType = (typeValue: unknown) => {
      if (typeof typeValue === "string") return typeValue;
      if (typeof typeValue === "number") return String(typeValue);
      return "unknown";
    };

    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!value || typeof value !== "object" || !("type" in value)) {
        continue;
      }
      const typeValue = (value as { type?: unknown }).type;
      fields[key] = { type: toFieldType(typeValue) };
    }
    return fields;
  } catch {
    return {};
  }
  return {};
};

const getValueAtPath = (variables: Record<string, unknown>, path: string) => {
  const parts = path.split(".");
  let current: unknown = variables;
  for (const part of parts) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const formatValue = (value: unknown, maxLength = 100) => {
  if (value === null || value === undefined) return "—";

  if (typeof value === "string") {
    if (value.length <= maxLength) {
      return value;
    }
    const remaining = value.length - maxLength;
    return `${value.slice(0, maxLength)}... (+${remaining} chars)`;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
};

export default function DatasetDetail(): React.ReactNode {
  const { slug, datasetSlug } = useParams<{ slug: string; datasetSlug: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [project, setProject] = useState<Project | null>(null);
  const [dataset, setDataset] = useState<DataSet | null>(null);
  const [recordsData, setRecordsData] = useState<RecordsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<DataSetRecord | null>(null);

  useEffect(() => {
    void fetchProject();
  }, [slug]);

  useEffect(() => {
    if (project && datasetSlug) {
      void fetchDataset(project.id, datasetSlug);
    }
  }, [project, datasetSlug]);

  useEffect(() => {
    if (project && dataset) {
      void fetchRecords(project.id, dataset.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, dataset, location.search]);

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

  const fetchDataset = async (projectId: number, datasetSlugValue: string) => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/projects/${projectId}/datasets`);
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset: ${response.statusText}`);
      }

      const data = await response.json();
      const match = (data.datasets ?? []).find(
        (item: DataSet) => item.slug === datasetSlugValue
      );
      if (!match) {
        setError("Dataset not found");
        setDataset(null);
        return;
      }
      setDataset(match);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dataset");
      console.error("Error fetching dataset:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecords = async (projectId: number, datasetId: number) => {
    try {
      setLoading(true);
      setError(null);

      // Build query string from URL params
      const params = new URLSearchParams(window.location.search);
      const page = params.get("page") ?? "1";
      const perPage = params.get("perPage") ?? "10";

      const apiParams = new URLSearchParams({
        page,
        pageSize: perPage,
      });

      const response = await fetch(
        `/api/projects/${projectId}/datasets/${datasetId}/records?${apiParams.toString()}`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch records: ${response.statusText}`);
      }

      const data = await response.json();
      setRecordsData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
      console.error("Error fetching records:", err);
    } finally {
      setLoading(false);
    }
  };

  const schemaFields = useMemo(
    () => (dataset ? parseSchemaFields(dataset.schema) : {}),
    [dataset]
  );

  const schemaColumns = useMemo(
    () => Object.keys(schemaFields).sort((a, b) => a.localeCompare(b)),
    [schemaFields]
  );

  const columns = useMemo<ColumnDef<DataSetRecord>[]>(
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
              aria-label="Select all records"
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
              aria-label="Select record"
            />
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 40,
      },
      {
        id: "createdAt",
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader column={column} label="Created" />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {formatDate(row.original.createdAt)}
          </div>
        ),
        enableSorting: true,
        enableColumnFilter: false,
        size: 150,
      },
      ...schemaColumns.map((column) => ({
        id: column,
        accessorFn: (row: DataSetRecord) => getValueAtPath(row.variables ?? {}, column),
        header: column,
        cell: ({ row }: { row: { original: DataSetRecord } }) => {
          const value = getValueAtPath(row.original.variables ?? {}, column);
          return (
            <div className="text-foreground">
              {formatValue(value)}
            </div>
          );
        },
        enableSorting: false,
        enableColumnFilter: false,
      })),
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                setRecordToDelete(row.original);
              }}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ),
        enableSorting: false,
        enableHiding: false,
        size: 80,
      },
    ],
    [schemaColumns]
  );

  const { table } = useDataTable({
    data: recordsData?.records ?? [],
    columns,
    pageCount: recordsData?.totalPages ?? 0,
    initialState: {
      sorting: [{ id: "createdAt", desc: true }],
      pagination: { pageIndex: 0, pageSize: 10 },
    },
    getRowId: (row) => String(row.id),
    debounceMs: 0,
    shallow: false,
  });

  if (loading && !dataset) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !project || !dataset) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error ?? "Dataset not found"}</div>
        <Button onClick={() => { void navigate(`/projects/${slug}/datasets`); }}>
          Back to Datasets
        </Button>
      </div>
    );
  }

  const handleRecordAdded = () => {
    void fetchRecords(project.id, dataset.id);
  };

  const handleDeleteRecords = async () => {
    if (!project || !dataset) return;

    const selectedRows = table.getSelectedRowModel().rows;
    const recordIds = selectedRows.map((row) => row.original.id);

    try {
      setIsDeleting(true);

      const response = await fetch(
        `/api/projects/${project.id}/datasets/${dataset.id}/records`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordIds }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete records");
      }

      table.resetRowSelection();
      setIsDeleteDialogOpen(false);
      void fetchRecords(project.id, dataset.id);
    } catch (err) {
      console.error("Error deleting records:", err);
      setError(err instanceof Error ? err.message : "Failed to delete records");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteSingleRecord = async () => {
    if (!project || !dataset || !recordToDelete) return;

    try {
      setIsDeleting(true);

      const response = await fetch(
        `/api/projects/${project.id}/datasets/${dataset.id}/records`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recordIds: [recordToDelete.id] }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to delete record");
      }

      setRecordToDelete(null);
      void fetchRecords(project.id, dataset.id);
    } catch (err) {
      console.error("Error deleting record:", err);
      setError(err instanceof Error ? err.message : "Failed to delete record");
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedRowCount = table.getFilteredSelectedRowModel().rows.length;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle={dataset.name}
        description={`${recordsData?.total ?? 0} record${recordsData?.total === 1 ? "" : "s"}`}
        actions={
          <AddRecordDialog
            projectId={project.id}
            datasetId={dataset.id}
            schema={schemaFields}
            onRecordAdded={handleRecordAdded}
          />
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="w-full space-y-4">
          {!recordsData || recordsData.records.length === 0 ? (
            <div className="rounded-lg border border-border bg-card p-6">
              <h2 className="text-lg font-semibold text-foreground">No records yet</h2>
              <p className="text-sm text-muted-foreground mt-2 mb-4">
                Add logs to this dataset or create records manually.
              </p>
              <AddRecordDialog
                projectId={project.id}
                datasetId={dataset.id}
                schema={schemaFields}
                onRecordAdded={handleRecordAdded}
              />
            </div>
          ) : (
            <DataTable table={table}>
              <DataTableToolbar table={table}>
                {selectedRowCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {selectedRowCount} selected
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setIsDeleteDialogOpen(true)}
                    >
                      <Trash2 className="mr-1 h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </div>
                )}
              </DataTableToolbar>
            </DataTable>
          )}
        </div>
      </div>

      {/* Bulk delete dialog */}
      <ConfirmDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete records"
        description={`Are you sure you want to delete ${selectedRowCount} record${selectedRowCount === 1 ? "" : "s"}? This action cannot be undone.`}
        confirmText="Delete"
        onConfirm={() => { void handleDeleteRecords(); }}
        loading={isDeleting}
        variant="destructive"
      />

      {/* Single record delete dialog */}
      <ConfirmDialog
        open={!!recordToDelete}
        onOpenChange={(open) => {
          if (!open) setRecordToDelete(null);
        }}
        title="Delete record"
        description="Are you sure you want to delete this record? This action cannot be undone."
        confirmText="Delete"
        onConfirm={() => { void handleDeleteSingleRecord(); }}
        loading={isDeleting}
        variant="destructive"
      />
    </div>
  );
}
