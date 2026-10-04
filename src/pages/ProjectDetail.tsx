/* eslint-disable sonarjs/function-return-type */
import type * as React from "react";
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import ProjectPageHeader from "@/components/ProjectPageHeader";
import StatsGrid from "@/components/stats/StatsGrid";
import DailyExecutionsChart from "@/components/stats/DailyExecutionsChart";
import type { ProjectStatsResponse } from "@/lib/project-stats";

interface Project {
  id: number;
  name: string;
  slug: string;
  tenantId: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function ProjectDetail(): React.ReactNode {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<ProjectStatsResponse | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProject();
  }, [slug]);

  useEffect(() => {
    if (project) {
      void fetchStats(project.id);
    }
  }, [project]);

  const fetchStats = async (projectId: number) => {
    try {
      setStatsError(null);
      const response = await fetch(`/api/projects/${projectId}/stats`);

      if (!response.ok) {
        throw new Error(`Failed to fetch project stats: ${response.statusText}`);
      }

      setStats((await response.json()) as ProjectStatsResponse);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "Failed to load project stats");
      console.error("Error fetching project stats:", err);
    }
  };

  const fetchProject = async () => {
    try {
      setLoading(true);
      setError(null);
      setStats(null);
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-muted-foreground">Loading project...</div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-red-500 mb-4">{error ?? "Project not found"}</div>
        <Button onClick={() => { void navigate("/projects"); }}>Back to Projects</Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <ProjectPageHeader
        projectName={project.name}
        description={`Slug: ${project.slug}`}
        badge={
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              project.isActive
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400"
            }`}
          >
            {project.isActive ? "Active" : "Inactive"}
          </span>
        }
      />

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-5xl space-y-6">
          {statsError && <div className="text-sm text-red-500">{statsError}</div>}
          {!stats && !statsError && (
            <div className="text-sm text-muted-foreground">Loading stats...</div>
          )}
          {stats && (
            <>
              <StatsGrid stats={stats.stats} />
              <DailyExecutionsChart daily={stats.daily} />
            </>
          )}

          <div className="border border-border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Project Information
            </h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Project ID
                </dt>
                <dd className="text-sm text-foreground mt-1">{project.id}</dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Tenant ID
                </dt>
                <dd className="text-sm text-foreground mt-1">
                  {project.tenantId}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Created
                </dt>
                <dd className="text-sm text-foreground mt-1">
                  {formatDate(project.createdAt)}
                </dd>
              </div>
              <div>
                <dt className="text-sm font-medium text-muted-foreground">
                  Last Updated
                </dt>
                <dd className="text-sm text-foreground mt-1">
                  {formatDate(project.updatedAt)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
