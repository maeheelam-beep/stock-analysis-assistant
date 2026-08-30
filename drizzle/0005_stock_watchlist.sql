CREATE TABLE `stock_watchlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_stock_watchlist_owner_code` ON `stock_watchlist` (`owner_key`,`code`);
--> statement-breakpoint
CREATE INDEX `idx_stock_watchlist_owner_updated` ON `stock_watchlist` (`owner_key`,`updated_at`);
