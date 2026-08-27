CREATE TABLE `earlyTokenWatches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`baseAddress` varchar(80) NOT NULL,
	`pairAddress` varchar(80) NOT NULL,
	`symbol` varchar(64) NOT NULL,
	`name` varchar(160) NOT NULL,
	`sourceUrl` text NOT NULL,
	`discoverySourcesJson` text NOT NULL,
	`firstLiquidityUsd` float NOT NULL DEFAULT 0,
	`pairCreatedAt` timestamp,
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`stage` enum('early','confirmed') NOT NULL DEFAULT 'early',
	`confirmedAt` timestamp,
	`confirmationScanRunId` int,
	`earlyAlerted` boolean NOT NULL DEFAULT false,
	`confirmedAlerted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `earlyTokenWatches_id` PRIMARY KEY(`id`),
	CONSTRAINT `earlyTokenWatches_baseAddress_unique` UNIQUE(`baseAddress`)
);
--> statement-breakpoint
ALTER TABLE `alertEvents` MODIFY COLUMN `alertType` enum('threshold','liquidity_pull','decision_flip','early_watch','confirmed_alert') NOT NULL DEFAULT 'threshold';--> statement-breakpoint
CREATE INDEX `early_watches_stage_seen_idx` ON `earlyTokenWatches` (`stage`,`firstSeenAt`);--> statement-breakpoint
CREATE INDEX `early_watches_pair_idx` ON `earlyTokenWatches` (`pairAddress`);