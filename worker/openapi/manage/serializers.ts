import type { DataSet, Evaluation, Project, Prompt, PromptVersion } from "../../db/schema";
import type { DataSetDto, EvaluationDto, ProjectDto, PromptDto, PromptVersionDto } from "./schemas";

const parseJson = (value: string | null | undefined): unknown => {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const toIso = (value: Date | null | undefined): string => (value ? value.toISOString() : "");

export const serializeProject = (project: Project): ProjectDto => ({
  id: project.id,
  name: project.name,
  slug: project.slug,
  isActive: project.isActive,
  createdAt: toIso(project.createdAt),
});

export const serializePrompt = (prompt: Prompt, activeVersion: number | null): PromptDto => ({
  id: prompt.id,
  name: prompt.name,
  slug: prompt.slug,
  provider: prompt.provider,
  model: prompt.model,
  latestVersion: prompt.latestVersion,
  activeVersion,
  isActive: prompt.isActive,
});

export const serializePromptVersion = (version: PromptVersion): PromptVersionDto => ({
  id: version.id,
  version: version.version,
  provider: version.provider,
  model: version.model,
  body: parseJson(version.body),
  createdAt: toIso(version.createdAt),
});

export const serializeDataSet = (dataSet: DataSet): DataSetDto => ({
  id: dataSet.id,
  name: dataSet.name,
  slug: dataSet.slug,
  countOfRecords: dataSet.countOfRecords,
  schema: parseJson(dataSet.schema),
});

export const serializeEvaluation = (evaluation: Evaluation): EvaluationDto => ({
  id: evaluation.id,
  name: evaluation.name,
  slug: evaluation.slug,
  type: evaluation.type,
  state: evaluation.state,
  datasetId: evaluation.datasetId,
  workflowId: evaluation.workflowId,
  durationMs: evaluation.durationMs,
  createdAt: toIso(evaluation.createdAt),
});

export const parseResult = parseJson;
