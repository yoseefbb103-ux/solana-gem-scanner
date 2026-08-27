CREATE TABLE `filterSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scopeKey` varchar(80) NOT NULL,
	`settingsJson` text NOT NULL,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `filterSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `filterSettings_scopeKey_unique` UNIQUE(`scopeKey`)
);
--> statement-breakpoint
CREATE TABLE `scanRuns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(80) NOT NULL,
	`status` enum('success','partial','failed') NOT NULL,
	`candidateCount` int NOT NULL DEFAULT 0,
	`filterJson` text NOT NULL,
	`errorMessage` text,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scanRuns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scannerSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanRunId` int NOT NULL,
	`pairAddress` varchar(80) NOT NULL,
	`baseAddress` varchar(80) NOT NULL,
	`symbol` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`dexId` varchar(64) NOT NULL,
	`sourceUrl` text NOT NULL,
	`priceUsd` float,
	`liquidityUsd` float NOT NULL DEFAULT 0,
	`volumeH1` float NOT NULL DEFAULT 0,
	`volumeH24` float NOT NULL DEFAULT 0,
	`transactionsH1` int NOT NULL DEFAULT 0,
	`priceChangeM5` float NOT NULL DEFAULT 0,
	`priceChangeH1` float NOT NULL DEFAULT 0,
	`pairCreatedAt` timestamp,
	`opportunityScore` float NOT NULL,
	`riskScore` float NOT NULL,
	`scoreDelta` float NOT NULL DEFAULT 0,
	`factorsJson` text NOT NULL,
	`warningsJson` text NOT NULL,
	`fetchedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `scannerSnapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `scan_runs_fetched_at_idx` ON `scanRuns` (`fetchedAt`);--> statement-breakpoint
CREATE INDEX `scanner_snapshots_base_address_idx` ON `scannerSnapshots` (`baseAddress`);--> statement-breakpoint
CREATE INDEX `scanner_snapshots_scan_run_idx` ON `scannerSnapshots` (`scanRunId`);--> statement-breakpoint
CREATE INDEX `scanner_snapshots_fetched_at_idx` ON `scannerSnapshots` (`fetchedAt`);