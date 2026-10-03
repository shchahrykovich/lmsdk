CREATE TABLE `BatchItems` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batchId` integer NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`customId` text NOT NULL,
	`partKey` text NOT NULL,
	`lineIndex` integer NOT NULL,
	`byteOffset` integer NOT NULL,
	`bytes` integer NOT NULL,
	`shardId` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`promptTokens` integer,
	`completionTokens` integer,
	`totalTokens` integer,
	`usage` text,
	`costUsd` real,
	`error` text,
	`hasResult` integer DEFAULT false NOT NULL,
	`completedAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `BatchItems_batchId_customId_key` ON `BatchItems` (`batchId`,`customId`);--> statement-breakpoint
CREATE UNIQUE INDEX `BatchItems_batchId_partKey_lineIndex_key` ON `BatchItems` (`batchId`,`partKey`,`lineIndex`);--> statement-breakpoint
CREATE INDEX `BatchItems_batchId_status_idx` ON `BatchItems` (`batchId`,`status`);--> statement-breakpoint
CREATE INDEX `BatchItems_batchId_shardId_idx` ON `BatchItems` (`batchId`,`shardId`);--> statement-breakpoint
CREATE TABLE `BatchShards` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batchId` integer NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`seq` integer NOT NULL,
	`parts` text DEFAULT '[]' NOT NULL,
	`itemCount` integer NOT NULL,
	`bytes` integer NOT NULL,
	`state` text DEFAULT 'planned' NOT NULL,
	`providerBatchId` text,
	`inputFileId` text,
	`providerStatus` text,
	`outcome` text,
	`resultFiles` text DEFAULT '[]' NOT NULL,
	`errorMessage` text,
	`submitAttempts` integer DEFAULT 0 NOT NULL,
	`submittedAt` integer,
	`endedAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `BatchShards_batchId_seq_key` ON `BatchShards` (`batchId`,`seq`);--> statement-breakpoint
CREATE TABLE `Batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`tenantId` integer NOT NULL,
	`projectId` integer NOT NULL,
	`promptId` integer NOT NULL,
	`version` integer NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`mode` text NOT NULL,
	`state` text DEFAULT 'draft' NOT NULL,
	`idempotencyKey` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`totalItems` integer DEFAULT 0 NOT NULL,
	`totalBytes` integer DEFAULT 0 NOT NULL,
	`succeededCount` integer DEFAULT 0 NOT NULL,
	`erroredCount` integer DEFAULT 0 NOT NULL,
	`expiredCount` integer DEFAULT 0 NOT NULL,
	`cancelledCount` integer DEFAULT 0 NOT NULL,
	`promptTokens` integer DEFAULT 0 NOT NULL,
	`completionTokens` integer DEFAULT 0 NOT NULL,
	`totalTokens` integer DEFAULT 0 NOT NULL,
	`costUsd` real DEFAULT 0 NOT NULL,
	`unpricedCount` integer DEFAULT 0 NOT NULL,
	`workflowId` text,
	`errorMessage` text,
	`cancelRequestedAt` integer,
	`submittedAt` integer,
	`finishedAt` integer,
	`resultsExpireAt` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `Batches_tenantId_projectId_promptId_idempotencyKey_key` ON `Batches` (`tenantId`,`projectId`,`promptId`,`idempotencyKey`);--> statement-breakpoint
CREATE INDEX `Batches_tenantId_projectId_promptId_idx` ON `Batches` (`tenantId`,`projectId`,`promptId`);--> statement-breakpoint
CREATE INDEX `Batches_resultsExpireAt_idx` ON `Batches` (`resultsExpireAt`);