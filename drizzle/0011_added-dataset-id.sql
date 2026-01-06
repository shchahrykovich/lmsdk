ALTER TABLE `Evaluations` ADD `datasetId` integer;--> statement-breakpoint
CREATE INDEX `Evaluations_datasetId_idx` ON `Evaluations` (`datasetId`);