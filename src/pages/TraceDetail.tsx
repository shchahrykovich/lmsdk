import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import SpanWaterfall from "@/components/SpanWaterfall";
import LogDetailDrawer from "@/components/LogDetailDrawer";

interface Project {
  id: number;
  name: string;
  slug: string;
}

interface UsageStats {
  providers: Array<{
    provider: string;
    models: Array<{
      model: string;
      count: number;
      tokens: {
        [key: string]: number;
      };
    }>;
  }>;
}

interface TraceEntry {
  id: number;
  traceId: string;
  totalLogs: number;
  successCount: number;
  errorCount: number;
  totalDurationMs: number;
  stats: UsageStats | null;
  firstLogAt: number | string | null;
  lastLogAt: number | string | null;
  tracePath: string | null;
  createdAt: number | string;
  updatedAt: number | string;
}

interface LogEntry {
  id: number;
  tenantId: number;
  projectId: number;
  promptId: number;
  version: number;
  logPath: string | null;
  isSuccess: boolean;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: number | string;
  traceId: string | null;
  promptName: string | null;
  promptSlug: string | null;
  provider?: string | null;
  model?: string | null;
}

interface LogFiles {
  metadata: unknown | null;
  input: unknown | null;
  output: unknown | null;
  result: unknown | null;
  response: unknown | null;
  variables: unknown | null;
}

export default function TraceDetail() {
  const { slug, traceId } = useParams<{ slug: string; traceId: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [trace, setTrace] = useState<TraceEntry | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null);
  const [logFiles, setLogFiles] = useState<LogFiles | null>(null);
  const [logLoading, setLogLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [slug, traceId]);

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

      const traceResponse = await fetch(
        `/api/projects/${foundProject.id}/traces/${traceId}`
      );
      if (!traceResponse.ok) {
        throw new Error(`Failed to fetch trace: ${traceResponse.statusText}`);
      }
      const traceData = await traceResponse.json();
      setTrace(traceData.trace || null);
      setLogs(traceData.logs || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trace");
      console.error("Error fetching trace:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSpanClick = async (log: LogEntry) => {
    if (!project) return;

    setSelectedLog(log);
    setDrawerOpen(true);
    setLogLoading(true);

    try {
      const logResponse = await fetch(`/api/projects/${project.id}/logs/${log.id}`);
      if (!logResponse.ok) {
        throw new Error(`Failed to fetch log: ${logResponse.statusText}`);
      }
      const logData = await logResponse.json();
      setLogFiles(logData.files || null);
    } catch (err) {
      console.error("Error fetching log details:", err);
      setLogFiles(null);
    } finally {
      setLogLoading(false);
    }
  };

  const handleCloseDrawer = () => {
    setDrawerOpen(false);
    setSelectedLog(null);
    setLogFiles(null);
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error || !project || !trace) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error || "Trace not found"}</div>
        <Button onClick={() => navigate(`/projects/${slug}/traces`)}>
          Back to Traces
        </Button>
      </div>
    );
  }

  // Stats are already parsed as object from API
  const usageStats = trace.stats;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        pageTitle={`Trace: ${trace.traceId}`}
        description={`${trace.totalLogs} log${trace.totalLogs !== 1 ? "s" : ""} in trace`}
        onBack={() => navigate(`/projects/${project.slug}/traces`)}
      />

      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="w-full space-y-6">
          {/* Usage Statistics */}
          {usageStats && usageStats.providers.length > 0 && (
            <div className="bg-card border rounded-lg p-6">
              <h2 className="text-lg font-semibold mb-4">Usage Statistics</h2>
              <div className="space-y-4">
                {usageStats.providers.map((providerData, idx) => (
                  <div key={idx} className="space-y-2">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase">
                      {providerData.provider}
                    </h3>
                    <div className="grid gap-3">
                      {providerData.models.map((modelData, modelIdx) => (
                        <div
                          key={modelIdx}
                          className="flex items-start justify-between p-3 bg-muted/50 rounded"
                        >
                          <div className="space-y-1">
                            <div className="font-mono text-sm">{modelData.model}</div>
                            <div className="text-xs text-muted-foreground">
                              {modelData.count} call{modelData.count !== 1 ? "s" : ""}
                            </div>
                          </div>
                          <div className="text-right space-y-1">
                            {Object.entries(modelData.tokens)
                              .filter(([, value]) => value > 0)
                              .map(([key, value]) => (
                                <div key={key} className="text-xs">
                                  <span className="text-muted-foreground">
                                    {key.replace(/_/g, " ")}:
                                  </span>{" "}
                                  <span className="font-mono">{value.toLocaleString()}</span>
                                </div>
                              ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Waterfall Chart */}
          <div>
            <SpanWaterfall logs={logs} onSpanClick={handleSpanClick} />
          </div>
        </div>
      </div>

      <LogDetailDrawer
        open={drawerOpen}
        onClose={handleCloseDrawer}
        log={selectedLog}
        files={logFiles}
        loading={logLoading}
      />
    </div>
  );
}
