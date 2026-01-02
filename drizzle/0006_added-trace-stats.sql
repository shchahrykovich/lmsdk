ALTER TABLE `PromptExecutionLogs` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `PromptExecutionLogs` ADD `model` text;--> statement-breakpoint
ALTER TABLE `PromptExecutionLogs` ADD `usage` text;--> statement-breakpoint
ALTER TABLE `Traces` ADD `stats` text;