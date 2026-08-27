CREATE TABLE `knownRuggedDeployers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`creatorAddress` varchar(80) NOT NULL,
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`hitCount` int NOT NULL DEFAULT 1,
	`source` varchar(80) NOT NULL DEFAULT 'RugCheck',
	CONSTRAINT `knownRuggedDeployers_id` PRIMARY KEY(`id`),
	CONSTRAINT `knownRuggedDeployers_creatorAddress_unique` UNIQUE(`creatorAddress`)
);
--> statement-breakpoint
ALTER TABLE `alertEvents` ADD `alertType` enum('threshold','liquidity_pull','decision_flip') DEFAULT 'threshold' NOT NULL;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `decision` enum('monitor','caution','avoid') DEFAULT 'caution' NOT NULL;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `liquidityDeltaPct` float;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `liquidityPullDetected` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `liquidityGrowthStable` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `liquidDexCount` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `metadataCompleteness` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `jupiterPriceUsd` float;--> statement-breakpoint
ALTER TABLE `scannerSnapshots` ADD `priceDivergencePct` float;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `knownRuggedDeployer` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `securityReports` ADD `sprayCount24h` int DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `known_rugged_deployers_last_seen_idx` ON `knownRuggedDeployers` (`lastSeenAt`);