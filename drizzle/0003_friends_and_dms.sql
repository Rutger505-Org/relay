CREATE TABLE `dm_message` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sender_id` text(255) NOT NULL,
	`recipient_id` text(255) NOT NULL,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`read_at` integer,
	FOREIGN KEY (`sender_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dm_sender_idx` ON `dm_message` (`sender_id`);--> statement-breakpoint
CREATE INDEX `dm_recipient_idx` ON `dm_message` (`recipient_id`);--> statement-breakpoint
CREATE INDEX `dm_created_idx` ON `dm_message` (`created_at`);--> statement-breakpoint
CREATE TABLE `friendship` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`requester_id` text(255) NOT NULL,
	`addressee_id` text(255) NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer,
	FOREIGN KEY (`requester_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`addressee_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `friendship_requester_idx` ON `friendship` (`requester_id`);--> statement-breakpoint
CREATE INDEX `friendship_addressee_idx` ON `friendship` (`addressee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `friendship_pair_unique` ON `friendship` (`requester_id`,`addressee_id`);