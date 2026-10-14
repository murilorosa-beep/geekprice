CREATE TYPE "public"."sync_status" AS ENUM('running', 'completed', 'partial', 'failed');--> statement-breakpoint
CREATE TABLE "external_product_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"external_id" varchar(180) NOT NULL,
	"external_variant_id" varchar(180),
	"source_updated_at" timestamp with time zone,
	"source_version" varchar(180),
	"last_imported_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" varchar(40) NOT NULL,
	"name" varchar(160) NOT NULL,
	"mode" varchar(20) DEFAULT 'read_only' NOT NULL,
	"encrypted_credentials" text NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"last_cursor" text,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"connection_id" uuid NOT NULL,
	"status" "sync_status" DEFAULT 'running' NOT NULL,
	"source" varchar(40) NOT NULL,
	"cursor_before" text,
	"cursor_after" text,
	"created_count" integer DEFAULT 0 NOT NULL,
	"updated_count" integer DEFAULT 0 NOT NULL,
	"skipped_count" integer DEFAULT 0 NOT NULL,
	"conflict_count" integer DEFAULT 0 NOT NULL,
	"error_count" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "external_product_mappings" ADD CONSTRAINT "external_product_mappings_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_product_mappings" ADD CONSTRAINT "external_product_mappings_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_product_mappings" ADD CONSTRAINT "external_product_mappings_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_connection_id_integration_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."integration_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_mapping_connection_external_uidx" ON "external_product_mappings" USING btree ("connection_id","external_id","external_variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "external_mapping_connection_inventory_uidx" ON "external_product_mappings" USING btree ("connection_id","inventory_item_id");--> statement-breakpoint
CREATE INDEX "external_mapping_org_idx" ON "external_product_mappings" USING btree ("organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "integration_org_kind_name_uidx" ON "integration_connections" USING btree ("organization_id","kind","name");--> statement-breakpoint
CREATE INDEX "integration_org_idx" ON "integration_connections" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "sync_runs_org_started_idx" ON "sync_runs" USING btree ("organization_id","started_at");--> statement-breakpoint
CREATE INDEX "sync_runs_connection_idx" ON "sync_runs" USING btree ("connection_id");