CREATE TABLE `PromptExecutionLogs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`promptId` integer NOT NULL,
	`version` integer NOT NULL,
	`logPath` text,
	`isSuccess` integer DEFAULT false NOT NULL,
	`errorMessage` text,
	`durationMs` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `PromptExecutionLogs_tenantId_idx` ON `PromptExecutionLogs` (`tenantId`);--> statement-breakpoint
CREATE INDEX `PromptExecutionLogs_promptId_idx` ON `PromptExecutionLogs` (`promptId`);--> statement-breakpoint
CREATE INDEX `PromptExecutionLogs_createdAt_idx` ON `PromptExecutionLogs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `PromptExecutionLogs_projectId_tenantId_idx` ON `PromptExecutionLogs` (`projectId`,`tenantId`);