/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import DeleteConfirmationDialog from "@/components/DeleteConfirmationDialog";

interface Evaluation {
  id: number;
  tenantId: number;
  projectId: number;
  name: string;
  slug: string;
  type: string;
  state: string;
  durationMs: number | null;
  inputSchema: string;
  outputSchema: string;
  createdAt: string;
  updatedAt: string;
  datasetName: string | null;
  prompts: { promptId: number; versionId: number; promptName: string; version: number }[];
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

export default function Evaluations(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [evaluationToDelete, setEvaluationToDelete] = useState<Evaluation | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    void fetchData();
  }, [slug]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

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

      const evaluationsResponse = await fetch(
        `/api/projects/${foundProject.id}/evaluations`
      );
      if (!evaluationsResponse.ok) {
        throw new Error(`Failed to fetch evaluations: ${evaluationsResponse.statusText}`);
      }
      const evaluationsData = await evaluationsResponse.json();
      setEvaluations(evaluationsData.evaluations ?? []);
    } catch (error) {
      console.error("Error fetching evaluations:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvaluation = async () => {
    if (!evaluationToDelete || !project) return;

    try {
      setIsDeleting(true);

      const response = await fetch(
        `/api/projects/${project.id}/evaluations/${evaluationToDelete.id}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error ?? "Failed to delete evaluation");
      }

      setEvaluations(evaluations.filter((e) => e.id !== evaluationToDelete.id));
      setEvaluationToDelete(null);
    } catch (error) {
      console.error("Error deleting evaluation:", error);
      setError(error instanceof Error ? error.message : "Failed to delete evaluation");
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (timestamp: string | number) => {
    const date = typeof timestamp === "number" ? new Date(timestamp * 1000) : new Date(timestamp);
    return date.toLocaleDateString();
  };

  const formatDuration = (durationMs: number | null) => {
    if (durationMs === null) return "—";
    if (durationMs < 1000) return `${durationMs} ms`;
    return `${(durationMs / 1000).toFixed(2)} s`;
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
        pageTitle="Evaluations"
        description="Review evaluation runs for this project"
        actions={
          <Button asChild className="gap-2">
            <a
              href={`/projects/${slug}/evaluations/new`}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey) {
                  return;
                }
                event.preventDefault();
                void navigate(`/projects/${slug}/evaluations/new`);
              }}
            >
              <Plus size={18} strokeWidth={2} />
              New evaluation
            </a>
          </Button>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {evaluations.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground">No evaluations yet</h2>
            <p className="text-sm text-muted-foreground mt-2">
              Evaluations will appear here once you run them for this project.
            </p>
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
                    Dataset
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Prompts
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    State
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Duration
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {evaluations.map((evaluation) => (
                  <tr
                    key={evaluation.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => {
                      void navigate(`/projects/${slug}/evaluations/${evaluation.id}`);
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">
                        {evaluation.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {evaluation.datasetName ?? "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-muted-foreground">
                        {evaluation.prompts.length > 0
                          ? evaluation.prompts
                              .map((p) => `${p.promptName} v${p.version}`)
                              .join(", ")
                          : "—"}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {evaluation.state}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {formatDuration(evaluation.durationMs)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {formatDate(evaluation.updatedAt)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEvaluationToDelete(evaluation);
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        open={!!evaluationToDelete}
        onOpenChange={(open) => {
          if (!open) setEvaluationToDelete(null);
        }}
        onConfirm={handleDeleteEvaluation}
        title="Delete Evaluation"
        description="This action cannot be undone."
        itemName={evaluationToDelete?.name}
        isDeleting={isDeleting}
      />
    </div>
  );
}
