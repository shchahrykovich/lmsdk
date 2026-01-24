import { ProjectId } from "../../../worker/shared/project-id";
import { EntityId } from "../../../worker/shared/entity-id";
import { PromptVersionId } from "../../../worker/prompts/prompt-version-id";

export function createProjectId(
  id: number,
  tenantId: number,
  userId = "test-user"
): ProjectId {
  return new ProjectId(id, tenantId, userId);
}

export function createEntityId(
  id: number,
  projectId: number,
  tenantId: number,
  userId = "test-user"
): EntityId<number> {
  const project = new ProjectId(projectId, tenantId, userId);
  return new EntityId<number>(id, project);
}

export function createPromptVersionId(
  version: number,
  promptId: number,
  projectId: number,
  tenantId: number,
  userId = "test-user"
): PromptVersionId {
  const project = new ProjectId(projectId, tenantId, userId);
  const entityId = new EntityId<number>(promptId, project);
  return new PromptVersionId(version, entityId);
}
