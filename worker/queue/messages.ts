/**
 * Queue message for execution log processing
 * Sent when a prompt execution finishes (success or error)
 */
export interface ExecutionLogQueueMessage {
  tenantId: number;
  projectId: number;
  promptId: number;
  version: number;
  logId: number;
}
