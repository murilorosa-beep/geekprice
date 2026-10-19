CREATE TABLE "index_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game" varchar(16) NOT NULL,
	"catalog_source" varchar(32) NOT NULL,
	"canonical_id" varchar(180) NOT NULL,
	"name" varchar(240) NOT NULL,
	"set_name" varchar(180) NOT NULL,
	"set_code" varchar(40) NOT NULL,
	"collector_number" varchar(60) NOT NULL,
	"language" varchar(12),
	"finish" varchar(40),
	"condition" varchar(40),
	"match_status" varchar(20) DEFAULT 'exact' NOT NULL,
	"coverage_status" varchar(20) DEFAULT 'unpriced' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "index_cards_game_check" CHECK ("index_cards"."game" IN ('pokemon','magic')),
	CONSTRAINT "index_cards_match_check" CHECK ("index_cards"."match_status" IN ('exact','probable','ambiguous','not_found'))
);
--> statement-breakpoint
ALTER TABLE "index_cards" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "index_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"source_external_id" varchar(180) NOT NULL,
	"source_url" text NOT NULL,
	"price_min" numeric(14, 2) NOT NULL,
	"provider_average" numeric(14, 2),
	"price_max" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'BRL' NOT NULL,
	"price_type" varchar(24) DEFAULT 'asking_summary' NOT NULL,
	"available_quantity" integer,
	"language" varchar(12),
	"finish" varchar(40),
	"condition" varchar(40),
	"observed_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	CONSTRAINT "index_observations_fingerprint_unique" UNIQUE("fingerprint"),
	CONSTRAINT "index_observations_money_check" CHECK ("index_observations"."price_min" > 0 AND "index_observations"."price_max" >= "index_observations"."price_min" AND ("index_observations"."provider_average" IS NULL OR "index_observations"."provider_average" > 0)),
	CONSTRAINT "index_observations_brl_check" CHECK ("index_observations"."currency" = 'BRL')
);
--> statement-breakpoint
ALTER TABLE "index_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "index_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" uuid NOT NULL,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"cursor" integer DEFAULT 0 NOT NULL,
	"searched" integer DEFAULT 0 NOT NULL,
	"priced" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"last_error" text
);
--> statement-breakpoint
ALTER TABLE "index_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "index_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"base_url" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"commercial_approved" boolean DEFAULT false NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "index_sources_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "index_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "index_observations" ADD CONSTRAINT "index_observations_card_id_index_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."index_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_observations" ADD CONSTRAINT "index_observations_source_id_index_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."index_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "index_runs" ADD CONSTRAINT "index_runs_source_id_index_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."index_sources"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "index_cards_identity_uidx" ON "index_cards" USING btree ("game","catalog_source","canonical_id");--> statement-breakpoint
CREATE INDEX "index_cards_lookup_idx" ON "index_cards" USING btree ("game","set_code","collector_number");--> statement-breakpoint
CREATE INDEX "index_cards_name_idx" ON "index_cards" USING btree ("game","name");--> statement-breakpoint
CREATE INDEX "index_observations_card_date_idx" ON "index_observations" USING btree ("card_id","observed_at");--> statement-breakpoint
CREATE INDEX "index_observations_source_date_idx" ON "index_observations" USING btree ("source_id","observed_at");--> statement-breakpoint
CREATE INDEX "index_runs_source_started_idx" ON "index_runs" USING btree ("source_id","started_at");