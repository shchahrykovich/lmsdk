CREATE TABLE `PromptExecutionLogVariablePaths` (
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`variablePath` text NOT NULL,
	PRIMARY KEY(`tenantId`, `projectId`, `variablePath`)
);
--> statement-breakpoint
CREATE INDEX `EvaluationResults_tenantId_projectId_evaluationId_idx` ON `EvaluationResults` (`tenantId`,`projectId`,`evaluationId`);