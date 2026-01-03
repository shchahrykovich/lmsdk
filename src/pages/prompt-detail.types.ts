export interface Prompt {
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

export interface Project {
  id: number;
  name: string;
  slug: string;
}

export interface Provider {
  id: string;
  name: string;
  description: string;
  models: { id: string; name: string }[];
}

export interface PromptVersion {
  id: number;
  promptId: number;
  tenantId: number;
  projectId: number;
  version: number;
  name: string;
  provider: string;
  model: string;
  body: string;
  slug: string;
  createdAt: string;
}
