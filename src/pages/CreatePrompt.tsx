import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import ProjectPageHeader from "@/components/ProjectPageHeader";

interface Project {
  id: number;
  name: string;
  slug: string;
}

export default function CreatePrompt() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [promptName, setPromptName] = useState("");
  const [promptSlug, setPromptSlug] = useState("");
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [body, setBody] = useState("{}");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    fetchProject();
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

  const fetchProject = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/projects");

      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }

      const data = await response.json();
      const foundProject = data.projects.find((p: Project) => p.slug === slug);

      if (!foundProject) {
        setError("Project not found");
      } else {
        setProject(foundProject);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load project");
      console.error("Error fetching project:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePrompt = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!project || !promptName.trim() || !promptSlug.trim() || !provider.trim() || !model.trim()) {
      setCreateError("Please fill in all required fields");
      return;
    }

    // Validate JSON body
    try {
      JSON.parse(body);
    } catch {
      setCreateError("Body must be valid JSON");
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
          provider: provider.trim(),
          model: model.trim(),
          body: body.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create prompt: ${response.statusText}`);
      }

      // Navigate back to prompts list
      navigate(`/projects/${slug}/prompts`);
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
        pageTitle="Create New Prompt"
        description="Add a new prompt to your project"
        onBack={() => navigate(`/projects/${project.slug}/prompts`)}
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl">
          <form onSubmit={handleCreatePrompt} className="space-y-6">
            {createError && (
              <div className="rounded-md bg-red-50 dark:bg-red-900/10 p-3">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {createError}
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">
                Prompt Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="name"
                placeholder="My Awesome Prompt"
                value={promptName}
                onChange={(e) => setPromptName(e.target.value)}
                required
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

            <div className="space-y-2">
              <Label htmlFor="provider">
                Provider <span className="text-red-500">*</span>
              </Label>
              <Input
                id="provider"
                placeholder="e.g., OpenAI, Anthropic"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The AI provider (e.g., OpenAI, Anthropic, Google)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">
                Model <span className="text-red-500">*</span>
              </Label>
              <Input
                id="model"
                placeholder="e.g., gpt-4, claude-3-opus"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                The specific model to use
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="body">
                Body (JSON) <span className="text-red-500">*</span>
              </Label>
              <textarea
                id="body"
                className="w-full min-h-[200px] px-3 py-2 text-sm rounded-md border border-input bg-background font-mono"
                placeholder='{"prompt": "Your prompt here", "temperature": 0.7}'
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">
                JSON object containing the prompt configuration
              </p>
            </div>

            <div className="flex items-center gap-3 pt-4">
              <Button
                type="submit"
                disabled={isCreating}
              >
                {isCreating ? "Creating..." : "Create Prompt"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate(`/projects/${project.slug}/prompts`)}
                disabled={isCreating}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
