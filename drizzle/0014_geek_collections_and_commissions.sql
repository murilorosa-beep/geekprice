CREATE TABLE "geek_collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" varchar(240) NOT NULL,
	"category" varchar(24) NOT NULL,
	"series" varchar(180) DEFAULT '' NOT NULL,
	"edition" varchar(100) DEFAULT '' NOT NULL,
	"status" varchar(24) DEFAULT 'owned' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"purchase_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"purchased_at" varchar(10) DEFAULT '' NOT NULL,
	"image_url" text DEFAULT '' NOT NULL,
	"location" varchar(180) DEFAULT '' NOT NULL,
	"borrower" varchar(160) DEFAULT '' NOT NULL,
	"loan_due_at" varchar(10) DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geek_collections_values_check" CHECK ("geek_collection_items"."quantity" > 0 AND "geek_collection_items"."purchase_price" >= 0 AND "geek_collection_items"."version" > 0),
	CONSTRAINT "geek_collections_category_check" CHECK ("geek_collection_items"."category" IN ('manga','comic','figure','game','card','other')),
	CONSTRAINT "geek_collections_status_check" CHECK ("geek_collection_items"."status" IN ('owned','wishlist','ordered','loaned')),
	CONSTRAINT "geek_collections_loan_check" CHECK ("geek_collection_items"."status" <> 'loaned' OR length(trim("geek_collection_items"."borrower")) > 0)
);
--> statement-breakpoint
ALTER TABLE "geek_collection_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "geek_commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"title" varchar(240) NOT NULL,
	"category" varchar(24) NOT NULL,
	"customer" varchar(160) NOT NULL,
	"contact" varchar(180) DEFAULT '' NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"status" varchar(24) DEFAULT 'quote' NOT NULL,
	"due_at" varchar(10) DEFAULT '' NOT NULL,
	"materials" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labor_hours" numeric(10, 2) DEFAULT '0' NOT NULL,
	"hourly_rate" numeric(12, 2) DEFAULT '0' NOT NULL,
	"extra_costs" numeric(12, 2) DEFAULT '0' NOT NULL,
	"margin_percent" numeric(5, 2) DEFAULT '30' NOT NULL,
	"total_price" numeric(12, 2) DEFAULT '0' NOT NULL,
	"paid_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "geek_commissions_category_check" CHECK ("geek_commissions"."category" IN ('cosplay','craft','print3d','other')),
	CONSTRAINT "geek_commissions_status_check" CHECK ("geek_commissions"."status" IN ('quote','approved','production','ready','delivered','canceled')),
	CONSTRAINT "geek_commissions_values_check" CHECK ("geek_commissions"."quantity" > 0 AND "geek_commissions"."labor_hours" >= 0 AND "geek_commissions"."hourly_rate" >= 0 AND "geek_commissions"."extra_costs" >= 0 AND "geek_commissions"."total_price" >= 0 AND "geek_commissions"."paid_amount" >= 0 AND "geek_commissions"."paid_amount" <= "geek_commissions"."total_price" AND "geek_commissions"."margin_percent" >= 0 AND "geek_commissions"."margin_percent" <= 95 AND "geek_commissions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "geek_commissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "geek_collection_items" ADD CONSTRAINT "geek_collection_items_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "geek_commissions" ADD CONSTRAINT "geek_commissions_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "geek_collections_org_updated_idx" ON "geek_collection_items" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "geek_commissions_org_updated_idx" ON "geek_commissions" USING btree ("organization_id","updated_at");
--> statement-breakpoint
-- The application authorizes every operation on the server. Do not expose
-- collection contents or customer contacts through Supabase's public API.
DO $$
DECLARE api_role text;
BEGIN
  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
      EXECUTE format('REVOKE ALL ON TABLE public.geek_collection_items, public.geek_commissions FROM %I', api_role);
    END IF;
  END LOOP;
END $$;
