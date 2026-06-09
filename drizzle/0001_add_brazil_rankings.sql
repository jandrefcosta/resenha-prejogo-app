CREATE TABLE "brazil_rankings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brazil_rankings" ADD CONSTRAINT "brazil_rankings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_brazil_rankings_points" ON "brazil_rankings" USING btree ("total_points");