CREATE TABLE `EvaluationComparisons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`evaluationId` integer NOT NULL,
	`dataSetRecordId` integer NOT NULL,
	`leftVersionId` integer NOT NULL,
	`rightVersionId` integer NOT NULL,
	`description` text,
	`score` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `EvaluationComparisons_evaluationId_record_pair_key` ON `EvaluationComparisons` (`evaluationId`,`dataSetRecordId`,`leftVersionId`,`rightVersionId`);--> statement-breakpoint
CREATE INDEX `EvaluationComparisons_tenantId_projectId_evaluationId_idx` ON `EvaluationComparisons` (`tenantId`,`projectId`,`evaluationId`);--> statement-breakpoint
ALTER TABLE `Evaluations` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `Evaluations` ADD `baseEvaluationId` integer;