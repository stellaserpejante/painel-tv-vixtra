CREATE TABLE "activations" (
	"id" serial PRIMARY KEY NOT NULL,
	"slack_message_ts" text NOT NULL,
	"slack_channel_id" text NOT NULL,
	"client_name" text NOT NULL,
	"closer_name" text,
	"closer_slack_id" text,
	"closer_avatar_url" text,
	"partner_name" text,
	"partner_slack_id" text,
	"partner_avatar_url" text,
	"approved_limit" numeric(18, 2),
	"activated_value" numeric(18, 2),
	"activation_date" date,
	"expires_at" timestamp with time zone NOT NULL,
	"raw_text" text,
	"hubspot_deal_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_news" (
	"id" serial PRIMARY KEY NOT NULL,
	"tag" text DEFAULT 'aviso' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_cache" (
	"source" text PRIMARY KEY NOT NULL,
	"payload" jsonb,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_successful_update" timestamp with time zone,
	"last_attempt" timestamp with time zone,
	"next_update" timestamp with time zone,
	"error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer
);
--> statement-breakpoint
CREATE TABLE "integration_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"message" text NOT NULL,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metric_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"period_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_goals" (
	"id" serial PRIMARY KEY NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"goal_amount" numeric(18, 2) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text
);
--> statement-breakpoint
CREATE TABLE "new_hires" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"quote" text,
	"slack_user_id" text,
	"avatar_url" text,
	"joined_at" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" serial PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"display_name" text,
	"email" text,
	"slack_user_id" text,
	"avatar_url" text,
	"birthday" date,
	"hired_at" date,
	"department" text,
	"role" text,
	"active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wallet_charts" (
	"id" serial PRIMARY KEY NOT NULL,
	"image_url" text NOT NULL,
	"caption" text,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"uploaded_by" text,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "activations_slack_ts_idx" ON "activations" USING btree ("slack_message_ts");--> statement-breakpoint
CREATE INDEX "activations_expires_idx" ON "activations" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "integration_logs_created_idx" ON "integration_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "metric_snapshots_source_idx" ON "metric_snapshots" USING btree ("source","captured_at");--> statement-breakpoint
CREATE INDEX "metric_snapshots_period_idx" ON "metric_snapshots" USING btree ("period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_goals_year_month_idx" ON "monthly_goals" USING btree ("year","month");--> statement-breakpoint
CREATE UNIQUE INDEX "people_email_idx" ON "people" USING btree ("email");--> statement-breakpoint
CREATE INDEX "people_slack_idx" ON "people" USING btree ("slack_user_id");