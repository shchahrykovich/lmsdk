import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

interface Prompt {
  id: number;
  projectId: number;
  tenantId: number;
  name: string;
  slug: string;
  provider: string;
  model: string;
  body: string;
  latestVersion: number;
  isActive: boolean;
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

export default function Prompts() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [promptName, setPromptName] = useState("");
  const [promptSlug, setPromptSlug] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [slug]);

  useEffect(() => {
    if (promptName) {
      const slug = promptName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      setPromptSlug(slug);
    } else {
      setPromptSlug("");
    }
  }, [promptName]);

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

      // Fetch prompts for this project
      const promptsResponse = await fetch(`/api/projects/${foundProject.id}/prompts`);
      if (!promptsResponse.ok) {
        throw new Error(`Failed to fetch prompts: ${promptsResponse.statusText}`);
      }
      const promptsData = await promptsResponse.json();
      setPrompts(promptsData.prompts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
      console.error("Error fetching data:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
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

  const openCreateDialog = () => {
    setPromptName("");
    setPromptSlug("");
    setCreateError(null);
    setIsDialogOpen(true);
  };

  const handleCreatePrompt = async () => {
    if (!project || !promptName.trim() || !promptSlug.trim()) {
      return;
    }

    try {
      setIsCreating(true);
      setCreateError(null);

      const response = await fetch(`/api/projects/${project.id}/prompts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: promptName.trim(),
          slug: promptSlug.trim(),
          provider: "openai", // Default values, will be editable in detail page
          model: "gpt-4",
          body: "{}",
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create prompt: ${response.statusText}`);
      }

      const data = await response.json();
      const createdPrompt = data.prompt;

      setIsDialogOpen(false);
      setPromptName("");
      setPromptSlug("");
      setCreateError(null);

      // Redirect to the newly created prompt detail page
      navigate(`/projects/${project.slug}/prompts/${createdPrompt.slug}`);
    } catch (err) {
      console.error("Error creating prompt:", err);
      setCreateError(err instanceof Error ? err.message : "Failed to create prompt");
    } finally {
      setIsCreating(false);
    }
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
        <div className="text-red-500 mb-4">{error || "Project not found"}</div>
        <Button onClick={() => navigate("/projects")}>Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle="Prompts"
        description="Manage prompts for this project"
        onBack={() => navigate(`/projects/${project.slug}`)}
        actionIcon={<Plus size={18} strokeWidth={2} />}
        actionLabel="New prompt"
        onAction={openCreateDialog}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {prompts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
              <Plus size={24} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">
              No prompts yet
            </h3>
            <p className="text-sm text-muted-foreground mb-6 text-center max-w-sm">
              Get started by creating your first prompt
            </p>
            <Button className="gap-2" onClick={openCreateDialog}>
              <Plus size={18} strokeWidth={2} />
              Create prompt
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
                    Provider
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Model
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Version
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-card divide-y divide-border">
                {prompts.map((prompt) => (
                  <tr
                    key={prompt.id}
                    className="hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={(event) => {
                      const url = `/projects/${project.slug}/prompts/${prompt.slug}`;
                      if (event.metaKey || event.ctrlKey) {
                        window.open(url, "_blank", "noopener,noreferrer");
                        return;
                      }
                      navigate(url);
                    }}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-foreground">
                        {prompt.name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {prompt.provider}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        {prompt.model}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-muted-foreground">
                        v{prompt.latestVersion}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          prompt.isActive
                            ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
                        }`}
                      >
                        {prompt.isActive ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                      {formatDate(prompt.updatedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Prompt Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new prompt</DialogTitle>
            <DialogDescription>
              Enter a name for your prompt. A slug will be automatically generated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {createError && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-3">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {createError}
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="name">Prompt name</Label>
              <Input
                id="name"
                placeholder="My Awesome Prompt"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !isCreating) {
                    handleCreatePrompt();
                  }
                }}
              />
            </div>
            {promptSlug && (
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <div className="text-sm text-muted-foreground px-3 py-2 rounded-md bg-muted">
                  {promptSlug}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsDialogOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePrompt}
              disabled={!promptName.trim() || !promptSlug.trim() || isCreating}
            >
              {isCreating ? "Creating..." : "Create prompt"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
