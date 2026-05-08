CREATE TABLE "bolao_members" (
	"bolao_id" text NOT NULL,
	"user_id" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bolao_members_bolao_id_user_id_pk" PRIMARY KEY("bolao_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "bolao_rankings" (
	"bolao_id" text NOT NULL,
	"user_id" text NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bolao_rankings_bolao_id_user_id_pk" PRIMARY KEY("bolao_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "boloes" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"nome" text NOT NULL,
	"codigo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "boloes_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "follows" (
	"follower_id" text NOT NULL,
	"following_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "follows_follower_id_following_id_pk" PRIMARY KEY("follower_id","following_id")
);
--> statement-breakpoint
CREATE TABLE "global_rankings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_snapshots" (
	"fixture_id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"league_id" integer,
	"season" integer,
	"round" text,
	"status" text NOT NULL,
	"match_date" timestamp with time zone,
	"home_team_id" text,
	"home_team_name" text,
	"away_team_id" text,
	"away_team_name" text,
	"home_score" integer,
	"away_score" integer,
	"score_ht_home" integer,
	"score_ht_away" integer,
	"score_et_home" integer,
	"score_et_away" integer,
	"score_pen_home" integer,
	"score_pen_away" integer,
	"score_agg_home" integer,
	"score_agg_away" integer,
	"winner" text,
	"match_length_min" integer,
	"venue" text,
	"city" text,
	"referee" text,
	"has_home_lineup" boolean DEFAULT false,
	"has_away_lineup" boolean DEFAULT false,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "palpites" (
	"user_id" text NOT NULL,
	"fixture_id" text NOT NULL,
	"home_goals" integer NOT NULL,
	"away_goals" integer NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "palpites_user_id_fixture_id_pk" PRIMARY KEY("user_id","fixture_id")
);
--> statement-breakpoint
CREATE TABLE "pdf_files" (
	"id_jogo" text NOT NULL,
	"type" text NOT NULL,
	"content" "bytea" NOT NULL,
	"url" text,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pdf_files_id_jogo_type_pk" PRIMARY KEY("id_jogo","type")
);
--> statement-breakpoint
CREATE TABLE "post_likes" (
	"post_id" text NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "post_likes_post_id_user_id_pk" PRIMARY KEY("post_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" text PRIMARY KEY NOT NULL,
	"author_id" text NOT NULL,
	"club_id" text NOT NULL,
	"content" text NOT NULL,
	"like_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scores" (
	"user_id" text NOT NULL,
	"fixture_id" text NOT NULL,
	"points" integer NOT NULL,
	"outcome" text NOT NULL,
	"scored_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scores_user_id_fixture_id_pk" PRIMARY KEY("user_id","fixture_id")
);
--> statement-breakpoint
CREATE TABLE "suggestions" (
	"id" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"email_hash" text NOT NULL,
	"username" text,
	"display_name" text,
	"bio" text,
	"club_id" text,
	"password_hash" text,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_hash_unique" UNIQUE("email_hash"),
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "bolao_members" ADD CONSTRAINT "bolao_members_bolao_id_boloes_id_fk" FOREIGN KEY ("bolao_id") REFERENCES "public"."boloes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bolao_members" ADD CONSTRAINT "bolao_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bolao_rankings" ADD CONSTRAINT "bolao_rankings_bolao_id_boloes_id_fk" FOREIGN KEY ("bolao_id") REFERENCES "public"."boloes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bolao_rankings" ADD CONSTRAINT "bolao_rankings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_admin_id_users_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_follower_id_users_id_fk" FOREIGN KEY ("follower_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "follows" ADD CONSTRAINT "follows_following_id_users_id_fk" FOREIGN KEY ("following_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_rankings" ADD CONSTRAINT "global_rankings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "palpites" ADD CONSTRAINT "palpites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scores" ADD CONSTRAINT "scores_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bolao_members_user" ON "bolao_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_bolao_rankings_points" ON "bolao_rankings" USING btree ("bolao_id","total_points");--> statement-breakpoint
CREATE INDEX "idx_boloes_codigo" ON "boloes" USING btree ("codigo");--> statement-breakpoint
CREATE INDEX "idx_boloes_admin" ON "boloes" USING btree ("admin_id");--> statement-breakpoint
CREATE INDEX "idx_follows_following" ON "follows" USING btree ("following_id");--> statement-breakpoint
CREATE INDEX "idx_global_rankings_points" ON "global_rankings" USING btree ("total_points");--> statement-breakpoint
CREATE INDEX "idx_ms_status_league" ON "match_snapshots" USING btree ("status","league_id");--> statement-breakpoint
CREATE INDEX "idx_ms_home_team" ON "match_snapshots" USING btree ("home_team_id","league_id");--> statement-breakpoint
CREATE INDEX "idx_ms_away_team" ON "match_snapshots" USING btree ("away_team_id","league_id");--> statement-breakpoint
CREATE INDEX "idx_ms_date" ON "match_snapshots" USING btree ("match_date");--> statement-breakpoint
CREATE INDEX "idx_ms_league_round" ON "match_snapshots" USING btree ("league_id","round");--> statement-breakpoint
CREATE INDEX "idx_ms_source_league" ON "match_snapshots" USING btree ("source","league_id");--> statement-breakpoint
CREATE INDEX "idx_palpites_fixture" ON "palpites" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "idx_palpites_user_date" ON "palpites" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_pdf_files_id_jogo" ON "pdf_files" USING btree ("id_jogo");--> statement-breakpoint
CREATE INDEX "idx_post_likes_user" ON "post_likes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_posts_author_date" ON "posts" USING btree ("author_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_posts_club_date" ON "posts" USING btree ("club_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_scores_fixture" ON "scores" USING btree ("fixture_id");--> statement-breakpoint
CREATE INDEX "idx_scores_user_date" ON "scores" USING btree ("user_id","scored_at");--> statement-breakpoint
CREATE INDEX "idx_users_email_hash" ON "users" USING btree ("email_hash");--> statement-breakpoint
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");