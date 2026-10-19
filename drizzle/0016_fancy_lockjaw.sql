CREATE TABLE "index_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"file_hash" varchar(64) NOT NULL,
	"file_name" varchar(240) NOT NULL,
	"acquisition_method" varchar(40) NOT NULL,
	"rights_reference" text NOT NULL,
	"source_snapshot_at" timestamp with time zone NOT NULL,
	"total_rows" integer NOT NULL,
	"valid_rows" integer NOT NULL,
	"priced_rows" integer NOT NULL,
	"unpriced_rows" integer NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"status" varchar(20) NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "index_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "index_inventory_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"inventory_item_id" uuid NOT NULL,
	"card_id" uuid NOT NULL,
	"match_status" varchar(20) NOT NULL,
	"confirmed_by_id" uuid,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "index_inventory_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "index_cards" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "index_sources" ADD COLUMN "acquisition_method" varchar(40);--> statement-breakpoint
ALTER TABLE "index_sources" ADD COLUMN "rights_reference" text;--> statement-breakpoint
ALTER TABLE "index_imports" ADD CONSTRAINT "index_imports_source_id_index_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."index_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_inventory_links" ADD CONSTRAINT "index_inventory_links_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_inventory_links" ADD CONSTRAINT "index_inventory_links_inventory_item_id_inventory_items_id_fk" FOREIGN KEY ("inventory_item_id") REFERENCES "public"."inventory_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_inventory_links" ADD CONSTRAINT "index_inventory_links_card_id_index_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."index_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_inventory_links" ADD CONSTRAINT "index_inventory_links_confirmed_by_id_users_id_fk" FOREIGN KEY ("confirmed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "index_imports_source_file_uidx" ON "index_imports" USING btree ("source_id","file_hash");--> statement-breakpoint
CREATE INDEX "index_imports_created_idx" ON "index_imports" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "index_inventory_links_item_uidx" ON "index_inventory_links" USING btree ("organization_id","inventory_item_id");--> statement-breakpoint
CREATE INDEX "index_inventory_links_card_idx" ON "index_inventory_links" USING btree ("card_id");