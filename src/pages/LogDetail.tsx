import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import JsonSection from "@/components/JsonSection";

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

interface LogFiles {
  metadata: unknown | null;
  input: unknown | null;
  output: unknown | null;
  result: unknown | null;
  response: unknown | null;
  variables: unknown | null;
}

export default function LogDetail() {
  const { slug, logId } = useParams<{ slug: string; logId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [log, setLog] = useState<LogEntry | null>(null);
  const [files, setFiles] = useState<LogFiles | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [slug, logId]);

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

      const logResponse = await fetch(`/api/projects/${foundProject.id}/logs/${logId}`);
      if (!logResponse.ok) {
        throw new Error(`Failed to fetch log: ${logResponse.statusText}`);
      }
      const logData = await logResponse.json();
      setLog(logData.log || null);
      setFiles(logData.files || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load log");
      console.error("Error fetching log:", err);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (value: string | number) => {
    const timestamp =
      typeof value === "number" && value < 1_000_000_000_000 ? value * 1000 : value;
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !project || !log) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error || "Log not found"}</div>
        <Button onClick={() => navigate(`/projects/${slug}/logs`)}>Back to Logs</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle={`Log #${log.id}`}
        description={`${log.promptName || "Unknown prompt"} v${log.version} - ${log.provider && log.model ? `${log.provider}/${log.model}` : "Unknown provider"}`}
        onBack={() => navigate(`/projects/${project.slug}/logs`)}
        badge={
          <span
            className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${
              log.isSuccess
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {log.isSuccess ? "Success" : "Error"}
          </span>
        }
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="w-full space-y-6">

          {/*<div className="rounded-lg border border-border bg-card p-6 group">*/}
          {/*  <div className="flex items-center justify-between gap-3">*/}
          {/*    <h2 className="text-lg font-semibold text-foreground">Metadata</h2>*/}
          {/*    <Button*/}
          {/*        variant="ghost"*/}
          {/*        size="sm"*/}
          {/*        className="opacity-0 transition-opacity group-hover:opacity-100"*/}
          {/*        onClick={() => copyToClipboard(files?.metadata ?? null)}*/}
          {/*    >*/}
          {/*      Copy*/}
          {/*    </Button>*/}
          {/*  </div>*/}
          {/*  <pre className="mt-3 text-xs text-muted-foreground whitespace-pre-wrap">*/}
          {/*    {stringifyData(files?.metadata ?? null)}*/}
          {/*  </pre>*/}
          {/*</div>*/}

          <div className="rounded-lg border border-border bg-card p-6">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-muted-foreground">
                {typeof log.durationMs === "number" ? `${log.durationMs} ms` : "Duration unavailable"}
              </span>
              <span className="text-sm text-muted-foreground">
                {formatDateTime(log.createdAt)}
              </span>
            </div>
            {log.errorMessage && (
                <div className="text-sm text-red-500 mt-4 whitespace-pre-wrap">
                  {log.errorMessage}
                </div>
            )}
          </div>

          <JsonSection title="Variables" data={files?.variables} collapsed={false} />
          <JsonSection title="Response" data={files?.response} collapsed={false} />
          <JsonSection title="Result" data={files?.result} collapsed={2} />
          <JsonSection title="Input" data={files?.input} collapsed={2} />
          <JsonSection title="Output" data={files?.output} collapsed={2} />
        </div>
      </div>
    </div>
  );
}
