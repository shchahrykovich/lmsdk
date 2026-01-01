CREATE TABLE `Traces` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`traceId` text NOT NULL,
	`totalLogs` integer DEFAULT 0 NOT NULL,
	`successCount` integer DEFAULT 0 NOT NULL,
	`errorCount` integer DEFAULT 0 NOT NULL,
	`totalDurationMs` integer DEFAULT 0 NOT NULL,
	`firstLogAt` integer,
	`lastLogAt` integer,
	`tracePath` text,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Traces_tenantId_projectId_traceId_key` ON `Traces` (`tenantId`,`projectId`,`traceId`);--> statement-breakpoint
CREATE INDEX `Traces_tenantId_idx` ON `Traces` (`tenantId`);--> statement-breakpoint
CREATE INDEX `Traces_projectId_tenantId_idx` ON `Traces` (`projectId`,`tenantId`);--> statement-breakpoint
CREATE INDEX `Traces_traceId_idx` ON `Traces` (`traceId`);