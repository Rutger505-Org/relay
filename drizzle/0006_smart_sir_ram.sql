ALTER TABLE `dm_message` ADD `type` text DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE `dm_message` ADD `call_status` text;--> statement-breakpoint
ALTER TABLE `dm_message` ADD `call_duration_sec` integer;