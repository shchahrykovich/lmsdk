export interface TenantProjectContext {
  tenantId: number;
  projectId: number;
}

export interface DataSetContext extends TenantProjectContext {
  dataSetId: number;
}
