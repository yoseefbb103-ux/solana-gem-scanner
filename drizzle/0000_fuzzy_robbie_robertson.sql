CREATE TYPE "role" AS ENUM ('user', 'admin');
CREATE TYPE "scan_status" AS ENUM ('success', 'partial', 'failed');
CREATE TYPE "execution_origin" AS ENUM ('manual', 'worker');
CREATE TYPE "decision" AS ENUM ('monitor', 'caution', 'avoid');
CREATE TYPE "lp_lock_status" AS ENUM ('locked', 'unlocked', 'unknown');
CREATE TYPE "source_health_event_type" AS ENUM ('normal', 'slow', 'throttled', 'error', 'recovered');
CREATE TYPE "outcome" AS ENUM ('pending', 'success', 'failed', 'unavailable');
CREATE TYPE "stage" AS ENUM ('early', 'confirmed');
CREATE TYPE "channel" AS ENUM ('in_app', 'telegram');
CREATE TYPE "alert_type" AS ENUM ('threshold', 'liquidity_pull', 'decision_flip', 'early_watch', 'confirmed_alert');
CREATE TYPE "delivery_status" AS ENUM ('queued', 'sent', 'skipped', 'failed');
CREATE TYPE "security_status" AS ENUM ('passed', 'flagged', 'unavailable');
--> statement-breakpoint
CREATE TABLE "alertEvents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "alertEvents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"baseAddress" varchar(80) NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"opportunityScore" real NOT NULL,
	"riskScore" real NOT NULL,
	"channel" "channel" NOT NULL,
	"alertType" "alert_type" DEFAULT 'threshold' NOT NULL,
	"deliveryStatus" "delivery_status" NOT NULL,
	"detail" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "earlyTokenWatches" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "earlyTokenWatches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"baseAddress" varchar(80) NOT NULL,
	"pairAddress" varchar(80) NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"sourceUrl" text NOT NULL,
	"discoverySourcesJson" text NOT NULL,
	"firstLiquidityUsd" real DEFAULT 0 NOT NULL,
	"pairCreatedAt" timestamp,
	"firstSeenAt" timestamp DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"stage" "stage" DEFAULT 'early' NOT NULL,
	"confirmedAt" timestamp,
	"confirmationScanRunId" integer,
	"earlyAlerted" boolean DEFAULT false NOT NULL,
	"confirmedAlerted" boolean DEFAULT false NOT NULL,
	CONSTRAINT "earlyTokenWatches_baseAddress_unique" UNIQUE("baseAddress")
);
--> statement-breakpoint
CREATE TABLE "filterSettings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "filterSettings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scopeKey" varchar(80) NOT NULL,
	"settingsJson" text NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "filterSettings_scopeKey_unique" UNIQUE("scopeKey")
);
--> statement-breakpoint
CREATE TABLE "knownRuggedDeployers" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "knownRuggedDeployers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"creatorAddress" varchar(80) NOT NULL,
	"firstSeenAt" timestamp DEFAULT now() NOT NULL,
	"lastSeenAt" timestamp DEFAULT now() NOT NULL,
	"hitCount" integer DEFAULT 1 NOT NULL,
	"source" varchar(80) DEFAULT 'RugCheck' NOT NULL,
	CONSTRAINT "knownRuggedDeployers_creatorAddress_unique" UNIQUE("creatorAddress")
);
--> statement-breakpoint
CREATE TABLE "performanceCheckpoints" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "performanceCheckpoints_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scanRunId" integer NOT NULL,
	"baseAddress" varchar(80) NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"sourceUrl" text NOT NULL,
	"opportunityScore" real NOT NULL,
	"riskScore" real NOT NULL,
	"baselinePriceUsd" real NOT NULL,
	"horizonMinutes" integer NOT NULL,
	"dueAt" timestamp NOT NULL,
	"observedAt" timestamp,
	"observedPriceUsd" real,
	"returnPct" real,
	"outcome" "outcome" DEFAULT 'pending' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scanRuns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scanRuns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" varchar(80) NOT NULL,
	"status" "scan_status" NOT NULL,
	"executionOrigin" "execution_origin" DEFAULT 'manual' NOT NULL,
	"candidateCount" integer DEFAULT 0 NOT NULL,
	"visibleCount" integer DEFAULT 0 NOT NULL,
	"filterJson" text NOT NULL,
	"errorMessage" text,
	"fetchedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scannerRunLocks" (
	"scopeKey" varchar(64) PRIMARY KEY NOT NULL,
	"lockToken" varchar(80) NOT NULL,
	"lockedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scannerSettings" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scannerSettings_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scopeKey" varchar(80) NOT NULL,
	"strictSecurity" boolean DEFAULT true NOT NULL,
	"opportunityAlertThreshold" real DEFAULT 72 NOT NULL,
	"riskAlertThreshold" real DEFAULT 28 NOT NULL,
	"cooldownMinutes" integer DEFAULT 120 NOT NULL,
	"deepScanLimit" integer DEFAULT 8 NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scannerSettings_scopeKey_unique" UNIQUE("scopeKey")
);
--> statement-breakpoint
CREATE TABLE "scannerSnapshots" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "scannerSnapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scanRunId" integer NOT NULL,
	"pairAddress" varchar(80) NOT NULL,
	"baseAddress" varchar(80) NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"dexId" varchar(64) NOT NULL,
	"sourceUrl" text NOT NULL,
	"priceUsd" real,
	"liquidityUsd" real DEFAULT 0 NOT NULL,
	"volumeH1" real DEFAULT 0 NOT NULL,
	"volumeH24" real DEFAULT 0 NOT NULL,
	"transactionsH1" integer DEFAULT 0 NOT NULL,
	"priceChangeM5" real DEFAULT 0 NOT NULL,
	"priceChangeH1" real DEFAULT 0 NOT NULL,
	"pairCreatedAt" timestamp,
	"opportunityScore" real NOT NULL,
	"riskScore" real NOT NULL,
	"scoreDelta" real DEFAULT 0 NOT NULL,
	"decision" "decision" DEFAULT 'caution' NOT NULL,
	"liquidityDeltaPct" real,
	"liquidityPullDetected" boolean DEFAULT false NOT NULL,
	"liquidityGrowthStable" boolean DEFAULT false NOT NULL,
	"liquidDexCount" integer DEFAULT 1 NOT NULL,
	"metadataCompleteness" integer DEFAULT 0 NOT NULL,
	"jupiterPriceUsd" real,
	"priceDivergencePct" real,
	"holderClusterScore" real,
	"bundleDetected" boolean,
	"washTradingScore" real,
	"fundingSourceOverlap" boolean,
	"fundingEvidenceStatus" varchar(48),
	"token2022Flags" text,
	"lpBurnVerified" boolean,
	"factorsJson" text NOT NULL,
	"warningsJson" text NOT NULL,
	"fetchedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "securityReports" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "securityReports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scanRunId" integer,
	"baseAddress" varchar(80) NOT NULL,
	"pairAddress" varchar(80) NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"source" varchar(80) DEFAULT 'RugCheck' NOT NULL,
	"status" "security_status" NOT NULL,
	"mintAuthorityOpen" boolean DEFAULT false NOT NULL,
	"freezeAuthorityOpen" boolean DEFAULT false NOT NULL,
	"lpLockStatus" "lp_lock_status" DEFAULT 'unknown' NOT NULL,
	"holderTopPct" real,
	"holderTop10Pct" real,
	"creatorAddress" varchar(80),
	"ruggedCreator" boolean DEFAULT false NOT NULL,
	"knownRuggedDeployer" boolean DEFAULT false NOT NULL,
	"sprayCount24h" integer DEFAULT 0 NOT NULL,
	"rugcheckScore" real,
	"symbolConflict" boolean DEFAULT false NOT NULL,
	"deepScanApplied" boolean DEFAULT false NOT NULL,
	"holderClusterScore" real,
	"bundleDetected" boolean,
	"washTradingScore" real,
	"fundingSourceOverlap" boolean,
	"fundingEvidenceStatus" varchar(48),
	"token2022Flags" text,
	"lpBurnVerified" boolean,
	"flagsJson" text NOT NULL,
	"checkedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sourceHealthEvents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "sourceHealthEvents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"source" varchar(80) NOT NULL,
	"eventType" "source_health_event_type" NOT NULL,
	"responseStatus" integer,
	"latencyMs" integer,
	"intervalMs" integer NOT NULL,
	"detail" text,
	"occurredAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"openId" varchar(64) NOT NULL,
	"name" text,
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "watchlist_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"baseAddress" varchar(80) NOT NULL,
	"pairAddress" varchar(80) NOT NULL,
	"symbol" varchar(64) NOT NULL,
	"name" varchar(160) NOT NULL,
	"sourceUrl" text NOT NULL,
	"addedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "alert_events_address_date_idx" ON "alertEvents" USING btree ("baseAddress","createdAt");--> statement-breakpoint
CREATE INDEX "early_watches_stage_seen_idx" ON "earlyTokenWatches" USING btree ("stage","firstSeenAt");--> statement-breakpoint
CREATE INDEX "early_watches_pair_idx" ON "earlyTokenWatches" USING btree ("pairAddress");--> statement-breakpoint
CREATE INDEX "known_rugged_deployers_last_seen_idx" ON "knownRuggedDeployers" USING btree ("lastSeenAt");--> statement-breakpoint
CREATE INDEX "performance_due_outcome_idx" ON "performanceCheckpoints" USING btree ("outcome","dueAt");--> statement-breakpoint
CREATE INDEX "performance_base_address_idx" ON "performanceCheckpoints" USING btree ("baseAddress");--> statement-breakpoint
CREATE INDEX "scan_runs_fetched_at_idx" ON "scanRuns" USING btree ("fetchedAt");--> statement-breakpoint
CREATE INDEX "scanner_run_locks_locked_at_idx" ON "scannerRunLocks" USING btree ("lockedAt");--> statement-breakpoint
CREATE INDEX "scanner_snapshots_base_address_idx" ON "scannerSnapshots" USING btree ("baseAddress");--> statement-breakpoint
CREATE INDEX "scanner_snapshots_symbol_idx" ON "scannerSnapshots" USING btree ("symbol");--> statement-breakpoint
CREATE INDEX "scanner_snapshots_scan_run_idx" ON "scannerSnapshots" USING btree ("scanRunId");--> statement-breakpoint
CREATE INDEX "scanner_snapshots_fetched_at_idx" ON "scannerSnapshots" USING btree ("fetchedAt");--> statement-breakpoint
CREATE INDEX "security_reports_base_address_idx" ON "securityReports" USING btree ("baseAddress");--> statement-breakpoint
CREATE INDEX "security_reports_scan_run_idx" ON "securityReports" USING btree ("scanRunId");--> statement-breakpoint
CREATE INDEX "security_reports_checked_at_idx" ON "securityReports" USING btree ("checkedAt");--> statement-breakpoint
CREATE INDEX "source_health_events_source_date_idx" ON "sourceHealthEvents" USING btree ("source","occurredAt");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_base_address_unique" ON "watchlist" USING btree ("baseAddress");