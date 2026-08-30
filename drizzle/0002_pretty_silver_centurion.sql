CREATE TABLE `us_watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_us_watchlist_owner_symbol` ON `us_watchlist` (`owner_key`,`symbol`);--> statement-breakpoint
CREATE INDEX `idx_us_watchlist_owner_updated` ON `us_watchlist` (`owner_key`,`updated_at`);