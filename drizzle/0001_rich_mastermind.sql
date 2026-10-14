CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(254) NOT NULL,
	"origin_hash" varchar(64) NOT NULL,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_attempt_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "login_attempts_email_origin_uidx" ON "login_attempts" USING btree ("email","origin_hash");--> statement-breakpoint
CREATE INDEX "login_attempts_cleanup_idx" ON "login_attempts" USING btree ("last_attempt_at");