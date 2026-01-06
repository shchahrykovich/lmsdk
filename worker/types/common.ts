export interface TenantProjectContext {
  tenantId: number;
  projectId: number;
}

export interface DataSetContext extends TenantProjectContext {
  dataSetId: number;
}

export interface DataSetIdentity extends TenantProjectContext {
  dataSetId: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  records: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
