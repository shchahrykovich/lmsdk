CREATE TABLE `EvaluationEvents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`evaluationId` integer NOT NULL,
	`type` text NOT NULL,
	`recordId` integer,
	`promptId` integer,
	`versionId` integer,
	`details` text DEFAULT '{}' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `EvaluationEvents_tenantId_projectId_evaluationId_idx` ON `EvaluationEvents` (`tenantId`,`projectId`,`evaluationId`);