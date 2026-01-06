CREATE TABLE `DataSetRecords` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`dataSetId` integer NOT NULL,
	`variables` text DEFAULT '{}' NOT NULL,
	`isDeleted` integer DEFAULT false NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `DataSetRecords_dataSetId_idx` ON `DataSetRecords` (`dataSetId`);--> statement-breakpoint
CREATE INDEX `DataSetRecords_tenantId_idx` ON `DataSetRecords` (`tenantId`);--> statement-breakpoint
CREATE INDEX `DataSetRecords_projectId_tenantId_idx` ON `DataSetRecords` (`projectId`,`tenantId`);--> statement-breakpoint
CREATE TABLE `DataSets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`name` text NOT NULL,
	`isDeleted` integer DEFAULT false NOT NULL,
	`countOfRecords` integer DEFAULT 0 NOT NULL,
	`schema` text DEFAULT '{}' NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `DataSets_tenantId_projectId_name_key` ON `DataSets` (`tenantId`,`projectId`,`name`);--> statement-breakpoint
CREATE INDEX `DataSets_tenantId_idx` ON `DataSets` (`tenantId`);--> statement-breakpoint
CREATE INDEX `DataSets_projectId_tenantId_idx` ON `DataSets` (`projectId`,`tenantId`);