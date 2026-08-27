CREATE TABLE `scannerRunLocks` (
	`scopeKey` varchar(64) NOT NULL,
	`lockToken` varchar(80) NOT NULL,
	`lockedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scannerRunLocks_scopeKey` PRIMARY KEY(`scopeKey`)
);
--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `holderClusterScore` float;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `bundleDetected` boolean;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `washTradingScore` float;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `fundingSourceOverlap` boolean;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `token2022Flags` text;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `lpBurnVerified` boolean;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `holderClusterScore` float;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `bundleDetected` boolean;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `washTradingScore` float;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `fundingSourceOverlap` boolean;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `token2022Flags` text;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `lpBurnVerified` boolean;--> statement-breakpoint
CREATE INDEX `scanner_run_locks_locked_at_idx` ON `scannerRunLocks` (`lockedAt`);