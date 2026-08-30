CREATE TABLE `holdings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`cost` text NOT NULL,
	`quantity` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_holdings_owner_kind_code` ON `holdings` (`owner_key`,`kind`,`code`);--> statement-breakpoint
CREATE INDEX `idx_holdings_owner_updated` ON `holdings` (`owner_key`,`updated_at`);