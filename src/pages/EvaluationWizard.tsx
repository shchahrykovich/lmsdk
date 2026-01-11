/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";

interface Project {
  id: number;
  name: string;
  slug: string;
}

interface Prompt {
  id: number;
  name: string;
}

interface PromptVersion {
  id: number;
  version: number;
  name: string;
}

interface Dataset {
  id: number;
  name: string;
  slug: string;
}

type PromptSelection = {
  id: string;
  promptId: string;
  versionId: string;
};

const createSelection = (promptId: string, versionId: string): PromptSelection => ({
  id: crypto.randomUUID(),
  promptId,
  versionId,
});

export default function EvaluationWizard(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [promptVersions, setPromptVersions] = useState<Record<number, PromptVersion[]>>({});
  const [name, setName] = useState("");
  const [datasetId, setDatasetId] = useState("");
  const [selections, setSelections] = useState<PromptSelection[]>([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState("");
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProject();
  }, [slug]);

  useEffect(() => {
    if (project) {
      void fetchPrompts(project.id);
      void fetchDatasets(project.id);
    }
  }, [project]);

  // Auto-generate evaluation name when dataset or prompts change
  useEffect(() => {
    if (!datasetId || selections.length === 0) {
      return;
    }

    const dataset = datasets.find((d) => d.id === Number(datasetId));
    if (!dataset) return;

    let generatedName = "";

    if (selections.length === 1) {
      const selection = selections[0];
      const prompt = prompts.find((p) => p.id === Number(selection.promptId));
      generatedName = `${prompt?.name ?? "prompt"} on ${dataset.name}`;
    } else if (selections.length > 1) {
      // Check if all selections are the same prompt (different versions)
      const uniquePromptIds = new Set(selections.map((s) => s.promptId));

      if (uniquePromptIds.size === 1) {
        // Same prompt, different versions: "eval {prompt} v{X} vs v{Y} on {dataset}"
        const selection = selections[0];
        const prompt = prompts.find((p) => p.id === Number(selection.promptId));
        const versions = selections
          .map((s) => {
            const versionList = promptVersions[Number(s.promptId)] ?? [];
            const version = versionList.find((v) => v.id === Number(s.versionId));
            return version ? `v${version.version}` : "v?";
          })
          .join(" vs ");
        generatedName = `${prompt?.name ?? "prompt"} ${versions} on ${dataset.name}`;
      } else {
        // Multiple different prompts: "eval {prompt} vs {prompt} on {dataset}"
        const promptNames = selections
          .map((selection) => {
            const prompt = prompts.find((p) => p.id === Number(selection.promptId));
            return prompt?.name ?? "prompt";
          })
          .join(" vs ");
        generatedName = `${promptNames} on ${dataset.name}`;
      }
    }

    setName(generatedName);
  }, [datasetId, selections, datasets, prompts, promptVersions]);

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
    } finally {
      setLoading(false);
    }
  };

  const fetchPrompts = async (projectId: number) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/prompts`);
      if (!response.ok) {
        throw new Error(`Failed to fetch prompts: ${response.statusText}`);
      }
      const data = await response.json();
      setPrompts(data.prompts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompts");
      console.error("Error fetching prompts:", err);
    }
  };

  const fetchDatasets = async (projectId: number) => {
    try {
      const response = await fetch(`/api/projects/${projectId}/datasets`);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets: ${response.statusText}`);
      }
      const data = await response.json();
      setDatasets(data.datasets ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load datasets");
      console.error("Error fetching datasets:", err);
    }
  };

  const fetchPromptVersions = async (projectId: number, promptId: number) => {
    try {
      const response = await fetch(
        `/api/projects/${projectId}/prompts/${promptId}/versions`
      );
      if (!response.ok) {
        throw new Error(`Failed to fetch versions: ${response.statusText}`);
      }
      const data = await response.json();
      const versions = data.versions ?? [];
      setPromptVersions((prev) => ({
        ...prev,
        [promptId]: versions,
      }));

      // Auto-select the latest version (first in the list)
      if (versions.length > 0) {
        setSelectedVersionId(String(versions[0].id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompt versions");
      console.error("Error fetching prompt versions:", err);
    }
  };

  const handlePromptChange = (promptId: string) => {
    setSelectedPromptId(promptId);
    setSelectedVersionId("");

    if (project && promptId) {
      const parsed = parseInt(promptId, 10);
      if (!promptVersions[parsed]) {
        void fetchPromptVersions(project.id, parsed);
      } else {
        // Auto-select the latest version (first in the list)
        const versions = promptVersions[parsed];
        if (versions.length > 0) {
          setSelectedVersionId(String(versions[0].id));
        }
      }
    }
  };

  const handleVersionSelect = (versionId: string) => {
    setSelectedVersionId(versionId);
  };

  const removePromptRow = (selectionId: string) => {
    setSelections((prev) => prev.filter((selection) => selection.id !== selectionId));
  };

  const canSubmit = useMemo(() => {
    if (!name.trim() || !project || !datasetId) return false;
    return selections.length > 0;
  }, [name, datasetId, selections, project]);

  const handleSubmit = async () => {
    if (!project || !canSubmit) return;

    try {
      setSubmitting(true);
      setError(null);

      const response = await fetch(
        `/api/projects/${project.id}/evaluations`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            type: "run",
            datasetId: Number(datasetId),
            prompts: selections.map((selection) => ({
              promptId: Number(selection.promptId),
              versionId: Number(selection.versionId),
            })),
          }),
        }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? "Failed to create evaluation");
      }

      void navigate(`/projects/${slug}/evaluations`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create evaluation");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenDialog = () => {
    setSelectedPromptId("");
    setSelectedVersionId("");
    setError(null);
    setIsDialogOpen(true);
  };

  const handleAddSelection = () => {
    if (!selectedPromptId || !selectedVersionId) return;
    setSelections((prev) => [
      ...prev,
      createSelection(selectedPromptId, selectedVersionId),
    ]);
    setIsDialogOpen(false);
  };

  const selectedVersions = selectedPromptId
    ? promptVersions[Number(selectedPromptId)] ?? []
    : [];

  if (loading && !project) {
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
        <Button onClick={() => { void navigate(`/projects/${slug}/evaluations`); }}>
          Back to Evaluations
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle="New Evaluation"
        description="Create a new evaluation run"
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="space-y-6 max-w-3xl">
          <div className="space-y-2">
            <Label htmlFor="evaluation-name">Evaluation name</Label>
            <Input
              id="evaluation-name"
              placeholder="Enter evaluation name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataset-select">Dataset</Label>
            <Select value={datasetId} onValueChange={setDatasetId}>
              <SelectTrigger id="dataset-select">
                <SelectValue placeholder="Select a dataset" />
              </SelectTrigger>
              <SelectContent>
                {datasets.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No datasets available
                  </div>
                ) : (
                  datasets.map((dataset) => (
                    <SelectItem key={dataset.id} value={String(dataset.id)}>
                      {dataset.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">Prompts</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleOpenDialog}
                disabled={selections.length >= 3}
              >
                <Plus size={16} />
                Add prompt
              </Button>
            </div>
            {selections.length >= 3 && (
              <div className="text-xs text-muted-foreground">
                Maximum of 3 prompts reached
              </div>
            )}

            <div className="space-y-3">
              {selections.length === 0 && (
                <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Add at least one prompt and version to run this evaluation.
                </div>
              )}
              {selections.map((selection) => {
                const prompt = prompts.find(
                  (item) => item.id === Number(selection.promptId)
                );
                const versions = promptVersions[Number(selection.promptId)] ?? [];
                const version = versions.find(
                  (item) => item.id === Number(selection.versionId)
                );
                return (
                  <div
                    key={selection.id}
                    className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card p-4"
                  >
                    <div className="flex-1 min-w-[200px]">
                      <div className="text-sm font-medium text-foreground">
                        {prompt?.name ?? "Unknown prompt"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {version
                          ? `v${version.version} • ${version.name}`
                          : "Unknown version"}
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePromptRow(selection.id)}
                      title="Remove prompt"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>

          {error && <div className="text-sm text-red-500">{error}</div>}

          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={() => { void navigate(`/projects/${slug}/evaluations`); }}
            >
              Cancel
            </Button>
            <Button onClick={() => { void handleSubmit(); }} disabled={!canSubmit || submitting}>
              {submitting ? "Creating..." : "Create evaluation"}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add prompt</DialogTitle>
            <DialogDescription>
              Select a prompt and version to include in this evaluation.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Prompt</Label>
              <Select value={selectedPromptId} onValueChange={handlePromptChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Select prompt" />
                </SelectTrigger>
                <SelectContent>
                  {prompts.map((prompt) => (
                    <SelectItem key={prompt.id} value={String(prompt.id)}>
                      {prompt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Version</Label>
              <Select
                value={selectedVersionId}
                onValueChange={handleVersionSelect}
                disabled={!selectedPromptId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select version" />
                </SelectTrigger>
                <SelectContent>
                  {selectedVersions.map((version) => (
                    <SelectItem key={version.id} value={String(version.id)}>
                      v{version.version} • {version.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleAddSelection}
              disabled={!selectedPromptId || !selectedVersionId}
            >
              Add prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
