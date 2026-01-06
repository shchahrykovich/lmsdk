/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { AddRecordDialog } from "@/components/AddRecordDialog";

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

const formatValue = (value: unknown) => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
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
  const [project, setProject] = useState<Project | null>(null);
  const [dataset, setDataset] = useState<DataSet | null>(null);
  const [records, setRecords] = useState<DataSetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
  }, [project, dataset]);

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
      const response = await fetch(
        `/api/projects/${projectId}/datasets/${datasetId}/records`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch records: ${response.statusText}`);
      }

      const data = await response.json();
      setRecords(data.records ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load records");
      console.error("Error fetching records:", err);
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

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle={dataset.name}
        description={`${records.length} record${records.length === 1 ? "" : "s"}`}
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
        {records.length === 0 ? (
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
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Created
                  </th>
                  {schemaColumns.map((column) => (
                    <th
                      key={column}
                      className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(record.createdAt)}
                    </td>
                    {schemaColumns.map((column) => {
                      const value = getValueAtPath(record.variables ?? {}, column);
                      return (
                        <td
                          key={`${record.id}-${column}`}
                          className="px-6 py-4 whitespace-nowrap text-sm text-foreground"
                        >
                          {formatValue(value)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
