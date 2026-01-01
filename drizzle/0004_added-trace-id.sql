ALTER TABLE `PromptExecutionLogs` ADD `traceId` text;--> statement-breakpoint
CREATE INDEX `PromptExecutionLogs_traceId_idx` ON `PromptExecutionLogs` (`tenantId`,`projectId`,`traceId`);