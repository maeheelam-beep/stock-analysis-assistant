CREATE TABLE `portfolio_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`owner_key` text NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`side` text NOT NULL,
	`quantity` text,
	`price` text,
	`amount` text NOT NULL,
	`fee` text DEFAULT '0' NOT NULL,
	`occurred_at` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_portfolio_transactions_owner_occurred` ON `portfolio_transactions` (`owner_key`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `idx_portfolio_transactions_owner_asset` ON `portfolio_transactions` (`owner_key`,`kind`,`code`);