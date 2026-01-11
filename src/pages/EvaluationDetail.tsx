import {useState, useEffect, type JSX} from "react";
import { useParams } from "react-router-dom";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { ChevronsDownUp, ChevronsUpDown, Maximize2 } from "lucide-react";
import EvaluationFullScreenDialog from "@/components/EvaluationFullScreenDialog";
import EvaluationResultsTable from "@/components/EvaluationResultsTable";

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
}

interface Prompt {
  promptId: number;
  versionId: number;
  version: number;
  promptName: string;
  responseFormat: string | null;
}

interface ResultOutput {
  promptId: number;
  versionId: number;
  result: string;
  durationMs: number | null;
}

interface ResultRow {
  recordId: number;
  variables: string;
  outputs: ResultOutput[];
}

interface EvaluationDetails {
  evaluation: Evaluation;
  prompts: Prompt[];
  results: ResultRow[];
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

export default function EvaluationDetail(): JSX.Element {
  const { slug, evaluationId } = useParams<{ slug: string; evaluationId: string }>();
  const [details, setDetails] = useState<EvaluationDetails | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [jsonCollapsed, setJsonCollapsed] = useState<boolean | number>(2);
  const [isAllExpanded, setIsAllExpanded] = useState(false);
  const [isFullScreenOpen, setIsFullScreenOpen] = useState(false);
  const [currentRecordIndex, setCurrentRecordIndex] = useState(0);

  useEffect(() => {
    void fetchData();
  }, [slug, evaluationId]);

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

      const detailsResponse = await fetch(
        `/api/projects/${foundProject.id}/evaluations/${evaluationId}`
      );
      if (!detailsResponse.ok) {
        throw new Error(`Failed to fetch evaluation details: ${detailsResponse.statusText}`);
      }
      const detailsData = await detailsResponse.json();
      setDetails(detailsData);
    } catch (error) {
      console.error("Error fetching evaluation details:", error);
      setError(error instanceof Error ? error.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !project || !details) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error ?? "Evaluation not found"}</div>
      </div>
    );
  }

  const { evaluation, prompts, results } = details;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle={`Evaluation: ${evaluation.name}`}
        description={`State: ${evaluation.state} | Type: ${evaluation.type}`}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {results.length === 0 ? (
          <div className="rounded-lg border border-border bg-card p-6">
            <h3 className="text-lg font-semibold text-foreground">No results yet</h3>
            <p className="text-sm text-muted-foreground mt-2">
              Results will appear here once the evaluation completes.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentRecordIndex(0);
                  setIsFullScreenOpen(true);
                }}
                className="gap-2"
              >
                <Maximize2 className="h-4 w-4" />
                Full Screen
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAllExpanded(!isAllExpanded);
                  setJsonCollapsed(isAllExpanded ? 1 : false);
                }}
                className="gap-2"
              >
                {isAllExpanded ? (
                  <>
                    <ChevronsUpDown className="h-4 w-4" />
                    Collapse All
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="h-4 w-4" />
                    Expand All
                  </>
                )}
              </Button>
            </div>
            <EvaluationResultsTable
              prompts={prompts}
              results={results}
              jsonCollapsed={jsonCollapsed}
            />
          </div>
        )}
      </div>

      <EvaluationFullScreenDialog
        isOpen={isFullScreenOpen}
        onOpenChange={setIsFullScreenOpen}
        currentRecordIndex={currentRecordIndex}
        setCurrentRecordIndex={setCurrentRecordIndex}
        results={results}
        prompts={prompts}
      />
    </div>
  );
}
