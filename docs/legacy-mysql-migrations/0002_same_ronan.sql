CREATE TABLE `alertEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`baseAddress` varchar(80) NOT NULL,
	`symbol` varchar(64) NOT NULL,
	`opportunityScore` float NOT NULL,
	`riskScore` float NOT NULL,
	`channel` enum('in_app','telegram') NOT NULL,
	`deliveryStatus` enum('queued','sent','skipped','failed') NOT NULL,
	`detail` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alertEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `performanceCheckpoints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanRunId` int NOT NULL,
	`baseAddress` varchar(80) NOT NULL,
	`symbol` varchar(64) NOT NULL,
	`sourceUrl` text NOT NULL,
	`opportunityScore` float NOT NULL,
	`riskScore` float NOT NULL,
	`baselinePriceUsd` float NOT NULL,
	`horizonMinutes` int NOT NULL,
	`dueAt` timestamp NOT NULL,
	`observedAt` timestamp,
	`observedPriceUsd` float,
	`returnPct` float,
	`outcome` enum('pending','success','failed','unavailable') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `performanceCheckpoints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scannerSettings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scopeKey` varchar(80) NOT NULL,
	`strictSecurity` boolean NOT NULL DEFAULT true,
	`opportunityAlertThreshold` float NOT NULL DEFAULT 72,
	`riskAlertThreshold` float NOT NULL DEFAULT 28,
	`cooldownMinutes` int NOT NULL DEFAULT 120,
	`deepScanLimit` int NOT NULL DEFAULT 8,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scannerSettings_id` PRIMARY KEY(`id`),
	CONSTRAINT `scannerSettings_scopeKey_unique` UNIQUE(`scopeKey`)
);
--> statement-breakpoint
CREATE TABLE `securityReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`scanRunId` int,
	`baseAddress` varchar(80) NOT NULL,
	`pairAddress` varchar(80) NOT NULL,
	`symbol` varchar(64) NOT NULL,
	`source` varchar(80) NOT NULL DEFAULT 'RugCheck',
	`status` enum('passed','flagged','unavailable') NOT NULL,
	`mintAuthorityOpen` boolean NOT NULL DEFAULT false,
	`freezeAuthorityOpen` boolean NOT NULL DEFAULT false,
	`lpLockStatus` enum('locked','unlocked','unknown') NOT NULL DEFAULT 'unknown',
	`holderTopPct` float,
	`holderTop10Pct` float,
	`creatorAddress` varchar(80),
	`ruggedCreator` boolean NOT NULL DEFAULT false,
	`rugcheckScore` float,
	`symbolConflict` boolean NOT NULL DEFAULT false,
	`deepScanApplied` boolean NOT NULL DEFAULT false,
	`flagsJson` text NOT NULL,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `securityReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sourceHealthEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`source` varchar(80) NOT NULL,
	`eventType` enum('normal','slow','throttled','error','recovered') NOT NULL,
	`responseStatus` int,
	`latencyMs` int,
	`intervalMs` int NOT NULL,
	`detail` text,
	`occurredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sourceHealthEvents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`baseAddress` varchar(80) NOT NULL,
	`pairAddress` varchar(80) NOT NULL,
	`symbol` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`sourceUrl` text NOT NULL,
	`addedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlist_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_base_address_unique` UNIQUE(`baseAddress`)
);
--> statement-breakpoint
ALTER TABLE `scanRuns` ADD `executionOrigin` enum('manual','worker') DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `scanRuns` ADD `visibleCount` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `alert_events_address_date_idx` ON `alertEvents` (`baseAddress`,`createdAt`);--> statement-breakpoint
CREATE INDEX `performance_due_outcome_idx` ON `performanceCheckpoints` (`outcome`,`dueAt`);--> statement-breakpoint
CREATE INDEX `performance_base_address_idx` ON `performanceCheckpoints` (`baseAddress`);--> statement-breakpoint
CREATE INDEX `security_reports_base_address_idx` ON `securityReports` (`baseAddress`);--> statement-breakpoint
CREATE INDEX `security_reports_scan_run_idx` ON `securityReports` (`scanRunId`);--> statement-breakpoint
CREATE INDEX `security_reports_checked_at_idx` ON `securityReports` (`checkedAt`);--> statement-breakpoint
CREATE INDEX `source_health_events_source_date_idx` ON `sourceHealthEvents` (`source`,`occurredAt`);--> statement-breakpoint
CREATE INDEX `scanner_snapshots_symbol_idx` ON `scannerSnapshots` (`symbol`);