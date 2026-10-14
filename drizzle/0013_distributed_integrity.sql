CREATE TABLE "autopilot_worker_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"run_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"channel" varchar(20),
	"last_item_id" uuid,
	"status" varchar(20) DEFAULT 'idle' NOT NULL,
	"worker_id" uuid,
	"fencing_version" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"error_summary" text,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "autopilot_worker_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "commerce_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"created_by_id" uuid,
	"payload_hash" varchar(64) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"import_run_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "commerce_previews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "price_change_batches" ADD COLUMN "idempotency_key" varchar(180);--> statement-breakpoint
ALTER TABLE "autopilot_worker_state" ADD CONSTRAINT "autopilot_worker_state_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_previews" ADD CONSTRAINT "commerce_previews_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_previews" ADD CONSTRAINT "commerce_previews_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_previews" ADD CONSTRAINT "commerce_previews_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commerce_previews" ADD CONSTRAINT "commerce_previews_import_run_id_sync_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "commerce_previews_org_idx" ON "commerce_previews" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "price_batches_org_idempotency_uidx" ON "price_change_batches" USING btree ("organization_id","idempotency_key");
--> statement-breakpoint
ALTER TABLE "autopilot_worker_state" ADD CONSTRAINT "autopilot_worker_state_singleton" CHECK ("id" = 1);
--> statement-breakpoint
ALTER TABLE "commerce_previews" ADD CONSTRAINT "commerce_previews_status_check" CHECK ("status" IN ('pending','committed','expired','rejected'));
--> statement-breakpoint
REVOKE ALL ON "autopilot_worker_state" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON "commerce_previews" FROM anon, authenticated;
--> statement-breakpoint
INSERT INTO "autopilot_worker_state" ("id") VALUES (1) ON CONFLICT DO NOTHING;
