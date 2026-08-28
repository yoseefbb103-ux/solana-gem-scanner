CREATE TYPE "signal_effect" AS ENUM ('hard_gate', 'score_deduction', 'informational');
--> statement-breakpoint
CREATE TYPE "signal_availability" AS ENUM ('available', 'unavailable');
--> statement-breakpoint
CREATE TYPE "signal_evidence_state" AS ENUM ('safe', 'unsafe', 'unknown', 'unavailable');
--> statement-breakpoint
CREATE TABLE "signalObservations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "signalObservations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"scanRunId" integer,
	"baseAddress" varchar(80) NOT NULL,
	"pairAddress" varchar(80),
	"stage" "stage",
	"signalKey" varchar(96) NOT NULL,
	"reasonCode" varchar(120) NOT NULL,
	"effect" "signal_effect" NOT NULL,
	"availability" "signal_availability" NOT NULL,
	"evidenceState" "signal_evidence_state" NOT NULL,
	"value" real,
	"valueJson" text,
	"source" varchar(96) NOT NULL,
	"observedAt" timestamp NOT NULL,
	"requestCost" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX "signal_observations_token_time_idx" ON "signalObservations" USING btree ("baseAddress","observedAt");--> statement-breakpoint
CREATE INDEX "signal_observations_key_time_idx" ON "signalObservations" USING btree ("signalKey","observedAt");--> statement-breakpoint
CREATE INDEX "signal_observations_scan_run_idx" ON "signalObservations" USING btree ("scanRunId");