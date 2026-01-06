CREATE TABLE `EvaluationPrompts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`evaluationId` integer NOT NULL,
	`promptId` integer NOT NULL,
	`versionId` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `EvaluationPrompts_evaluationId_idx` ON `EvaluationPrompts` (`evaluationId`);--> statement-breakpoint
CREATE INDEX `EvaluationPrompts_tenantId_idx` ON `EvaluationPrompts` (`tenantId`);--> statement-breakpoint
CREATE INDEX `EvaluationPrompts_projectId_tenantId_idx` ON `EvaluationPrompts` (`projectId`,`tenantId`);--> statement-breakpoint
CREATE TABLE `EvaluationResults` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`evaluationId` integer NOT NULL,
	`dataSetRecordId` integer NOT NULL,
	`promptId` integer NOT NULL,
	`versionId` integer NOT NULL,
	`result` text DEFAULT '{}' NOT NULL,
	`durationMs` integer,
	`stats` text DEFAULT '{}' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `EvaluationResults_evaluationId_idx` ON `EvaluationResults` (`evaluationId`);--> statement-breakpoint
CREATE INDEX `EvaluationResults_dataSetRecordId_idx` ON `EvaluationResults` (`dataSetRecordId`);--> statement-breakpoint
CREATE INDEX `EvaluationResults_tenantId_idx` ON `EvaluationResults` (`tenantId`);--> statement-breakpoint
CREATE INDEX `EvaluationResults_projectId_tenantId_idx` ON `EvaluationResults` (`projectId`,`tenantId`);--> statement-breakpoint
CREATE TABLE `Evaluations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`type` text NOT NULL,
	`state` text NOT NULL,
	`durationMs` integer,
	`inputSchema` text DEFAULT '{}' NOT NULL,
	`outputSchema` text DEFAULT '{}' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Evaluations_tenantId_projectId_name_key` ON `Evaluations` (`tenantId`,`projectId`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `Evaluations_tenantId_projectId_slug_key` ON `Evaluations` (`tenantId`,`projectId`,`slug`);--> statement-breakpoint
CREATE INDEX `Evaluations_tenantId_idx` ON `Evaluations` (`tenantId`);--> statement-breakpoint
CREATE INDEX `Evaluations_projectId_tenantId_idx` ON `Evaluations` (`projectId`,`tenantId`);