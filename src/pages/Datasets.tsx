/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import ProjectPageHeader from "@/components/ProjectPageHeader";

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

interface Project {
  id: number;
  name: string;
  slug: string;
  tenantId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function Datasets(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [datasets, setDatasets] = useState<DataSet[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [datasetName, setDatasetName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    void fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all projects to find the current one
      const projectsResponse = await fetch("/api/projects");
      if (!projectsResponse.ok) {
        throw new Error(`Failed to fetch projects: ${projectsResponse.statusText}`);
      }
      const projectsData = await projectsResponse.json();
      const foundProject = projectsData.projects.find((p: Project) => p.slug === slug);

      if (!foundProject) {
        setError("Project not found");
        setLoading(false);
        return;
      }

      setProject(foundProject);

      // Fetch datasets for this project
      const datasetsResponse = await fetch(`/api/projects/${foundProject.id}/datasets`);
      if (!datasetsResponse.ok) {
        throw new Error(`Failed to fetch datasets: ${datasetsResponse.statusText}`);
      }
      const datasetsData = await datasetsResponse.json();
      setDatasets(datasetsData.datasets ?? []);
    } catch (error) {
      console.error("Error fetching data:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateDataset = async () => {
    if (!datasetName.trim() || !project) return;

    try {
      setIsCreating(true);
      setCreateError(null);

      const response = await fetch(`/api/projects/${project.id}/datasets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: datasetName }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Failed to create dataset");
      }

      const data = await response.json();
      setDatasets([...datasets, data.dataset ?? {}]);
      setIsDialogOpen(false);
      setDatasetName("");
    } catch (error) {
      console.error("Error creating dataset:", error);
      setCreateError(error instanceof Error ? error.message : "Failed to create dataset");
    } finally {
      setIsCreating(false);
    }
  };

  const formatDate = (timestamp: string | number) => {
    const date = typeof timestamp === "number" ? new Date(timestamp * 1000) : new Date(timestamp);
    return date.toLocaleDateString();
  };

  const openCreateDialog = () => {
    setDatasetName("");
    setCreateError(null);
    setIsDialogOpen(true);
  };

  if (loading) {
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
        pageTitle="Datasets"
        description="Manage datasets for prompt evaluation"
        actionIcon={<Plus size={18} strokeWidth={2} />}
        actionLabel="New dataset"
        onAction={openCreateDialog}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {datasets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No datasets yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
              Create your first dataset to start collecting test data for prompt evaluation
            </p>
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus size={18} strokeWidth={2} />
              Create dataset
            </Button>
          </div>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Records
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {datasets.map((dataset) => (
                  <tr
                    key={dataset.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={(event) => {
                      const url = `/projects/${slug}/datasets/${dataset.slug}`;
                      if (event.metaKey || event.ctrlKey) {
                        window.open(url, "_blank", "noopener,noreferrer");
                        return;
                      }
                      void navigate(url);
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">
                        {dataset.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {dataset.countOfRecords}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {formatDate(dataset.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {formatDate(dataset.updatedAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Dataset Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Dataset</DialogTitle>
            <DialogDescription>
              Create an empty dataset for prompt evaluation. You can add records later.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="dataset-name">Dataset Name</Label>
              <Input
                id="dataset-name"
                placeholder="Enter dataset name"
                value={datasetName}
                onChange={(e) => setDatasetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleCreateDataset();
                  }
                }}
              />
            </div>

            {createError && (
              <div className="text-sm text-red-500">{createError}</div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                setDatasetName("");
                setCreateError(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => { void handleCreateDataset(); }}
              disabled={!datasetName.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create Dataset"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
