import type { HonoOpenAPIRouterType } from "chanfana";
import type { HonoEnv } from "../../routes/app";
import { ManageCreateProject, ManageGetProject, ManageListProjects, ManageListProviders } from "./projects";
import {
  ManageCreatePrompt,
  ManageCreatePromptVersion,
  ManageGetPrompt,
  ManageListPromptVersions,
  ManageListPrompts,
  ManageSetActiveVersion,
} from "./prompts";
import { ManageAddRecords, ManageCreateDataSet, ManageGetDataSet } from "./datasets";
import { ManageCreateEvaluation, ManageGetEvaluation, ManageListEvaluations } from "./evaluations";

export const MANAGE_BASE_PATH = "/api/v1/manage";

export function registerManageRoutes(openapi: HonoOpenAPIRouterType<HonoEnv>): void {
  const base = MANAGE_BASE_PATH;
  const project = `${base}/projects/:project`;

  openapi.get(`${base}/providers`, ManageListProviders);
  openapi.get(`${base}/projects`, ManageListProjects);
  openapi.post(`${base}/projects`, ManageCreateProject);
  openapi.get(project, ManageGetProject);

  openapi.get(`${project}/prompts`, ManageListPrompts);
  openapi.post(`${project}/prompts`, ManageCreatePrompt);
  openapi.get(`${project}/prompts/:prompt`, ManageGetPrompt);
  openapi.get(`${project}/prompts/:prompt/versions`, ManageListPromptVersions);
  openapi.post(`${project}/prompts/:prompt/versions`, ManageCreatePromptVersion);
  openapi.put(`${project}/prompts/:prompt/active-version`, ManageSetActiveVersion);

  openapi.post(`${project}/datasets`, ManageCreateDataSet);
  openapi.get(`${project}/datasets/:dataset`, ManageGetDataSet);
  openapi.post(`${project}/datasets/:dataset/records`, ManageAddRecords);

  openapi.get(`${project}/evaluations`, ManageListEvaluations);
  openapi.post(`${project}/evaluations`, ManageCreateEvaluation);
  openapi.get(`${project}/evaluations/:evaluation`, ManageGetEvaluation);
}
