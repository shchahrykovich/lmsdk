ALTER TABLE `DataSets` ADD COLUMN `slug` text NOT NULL DEFAULT '';
--> statement-breakpoint
UPDATE `DataSets` SET `slug` = `name` WHERE `slug` = '';
--> statement-breakpoint
CREATE UNIQUE INDEX `DataSets_tenantId_projectId_slug_key` ON `DataSets` (`tenantId`,`projectId`,`slug`);
