import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  primaryKey,
  jsonb,
  index,
  customType,
} from 'drizzle-orm/pg-core';

// ─── Custom types ──────────────────────────────────────────────────────────────

const bytea = customType<{ data: Buffer }>({
  dataType() { return 'bytea'; },
});

// ─── Usuários ──────────────────────────────────────────────────────────────────

export const users = pgTable('users', {
  id:           text('id').primaryKey(),
  email:        text('email').notNull().unique(),
  emailHash:    text('email_hash').notNull().unique(),
  username:     text('username').unique(),
  displayName:  text('display_name'),
  bio:          text('bio'),
  clubId:       text('club_id'),
  passwordHash: text('password_hash'),
  ip:           text('ip'),
  createdAt:    timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeen:     timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('idx_users_email_hash').on(t.emailHash),
  index('idx_users_username').on(t.username),
]);

// ─── Bolões ────────────────────────────────────────────────────────────────────

export const boloes = pgTable('boloes', {
  id:        text('id').primaryKey(),
  adminId:   text('admin_id').notNull().references(() => users.id),
  nome:      text('nome').notNull(),
  codigo:    text('codigo').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('idx_boloes_codigo').on(t.codigo),
  index('idx_boloes_admin').on(t.adminId),
]);

export const bolaoMembers = pgTable('bolao_members', {
  bolaoId:  text('bolao_id').notNull().references(() => boloes.id, { onDelete: 'cascade' }),
  userId:   text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.bolaoId, t.userId] }),
  index('idx_bolao_members_user').on(t.userId),
]);

// ─── Palpites e Scores ─────────────────────────────────────────────────────────

export const palpites = pgTable('palpites', {
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fixtureId: text('fixture_id').notNull(),
  homeGoals: integer('home_goals').notNull(),
  awayGoals: integer('away_goals').notNull(),
  locked:    boolean('locked').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.userId, t.fixtureId] }),
  index('idx_palpites_fixture').on(t.fixtureId),
  index('idx_palpites_user_date').on(t.userId, t.createdAt),
]);

export const scores = pgTable('scores', {
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  fixtureId: text('fixture_id').notNull(),
  points:    integer('points').notNull(),
  outcome:   text('outcome').notNull(), // 'exact' | 'correct' | 'miss'
  scoredAt:  timestamp('scored_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.userId, t.fixtureId] }),
  index('idx_scores_fixture').on(t.fixtureId),
  index('idx_scores_user_date').on(t.userId, t.scoredAt),
]);

// ─── Rankings ──────────────────────────────────────────────────────────────────

export const bolaoRankings = pgTable('bolao_rankings', {
  bolaoId:     text('bolao_id').notNull().references(() => boloes.id, { onDelete: 'cascade' }),
  userId:      text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').notNull().default(0),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.bolaoId, t.userId] }),
  index('idx_bolao_rankings_points').on(t.bolaoId, t.totalPoints),
]);

export const globalRankings = pgTable('global_rankings', {
  userId:      text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').notNull().default(0),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('idx_global_rankings_points').on(t.totalPoints),
]);

// "Só Brasil" parallel ranking — Brazil's games across all phases. Postgres
// mirror of the bolao:brazil:ranking ZSet; Redis is the idempotency authority.
export const brazilRankings = pgTable('brazil_rankings', {
  userId:      text('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  totalPoints: integer('total_points').notNull().default(0),
  updatedAt:   timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('idx_brazil_rankings_points').on(t.totalPoints),
]);

// ─── Social ────────────────────────────────────────────────────────────────────

export const posts = pgTable('posts', {
  id:        text('id').primaryKey(),
  authorId:  text('author_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  clubId:    text('club_id').notNull(),
  content:   text('content').notNull(),
  likeCount: integer('like_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('idx_posts_author_date').on(t.authorId, t.createdAt),
  index('idx_posts_club_date').on(t.clubId, t.createdAt),
]);

export const postLikes = pgTable('post_likes', {
  postId:    text('post_id').notNull().references(() => posts.id, { onDelete: 'cascade' }),
  userId:    text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.postId, t.userId] }),
  index('idx_post_likes_user').on(t.userId),
]);

export const follows = pgTable('follows', {
  followerId:  text('follower_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  followingId: text('following_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.followerId, t.followingId] }),
  index('idx_follows_following').on(t.followingId),
]);

export const suggestions = pgTable('suggestions', {
  id:        text('id').primaryKey(),
  content:   text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Match Snapshots — fonte de verdade para jogos encerrados ──────────────────

export const matchSnapshots = pgTable('match_snapshots', {
  fixtureId:    text('fixture_id').primaryKey(),
  source:       text('source').notNull(), // 'api-football' | 'cbf' | 'conmebol'
  leagueId:     integer('league_id'),     // 71=Série A, 73=Copa BR, 13=Lib, 11=Sul-Am, 1=Copa 2026
  season:       integer('season'),
  round:        text('round'),

  status:       text('status').notNull(), // 'finished' | 'postponed'
  matchDate:    timestamp('match_date', { withTimezone: true }),

  homeTeamId:   text('home_team_id'),
  homeTeamName: text('home_team_name'),
  awayTeamId:   text('away_team_id'),
  awayTeamName: text('away_team_name'),

  homeScore: integer('home_score'),
  awayScore: integer('away_score'),

  // Detalhes CONMEBOL (HT, ET, pênaltis, agregado)
  scoreHtHome:  integer('score_ht_home'),
  scoreHtAway:  integer('score_ht_away'),
  scoreEtHome:  integer('score_et_home'),
  scoreEtAway:  integer('score_et_away'),
  scorePenHome: integer('score_pen_home'),
  scorePenAway: integer('score_pen_away'),
  scoreAggHome: integer('score_agg_home'),
  scoreAggAway: integer('score_agg_away'),
  winner:       text('winner'),        // 'home' | 'away' | 'draw' | null
  matchLengthMin: integer('match_length_min'),

  venue:    text('venue'),
  city:     text('city'),
  referee:  text('referee'),

  // Indicadores CBF — substitui inferRoundStatus
  hasHomeLineup: boolean('has_home_lineup').default(false),
  hasAwayLineup: boolean('has_away_lineup').default(false),

  // Payload completo (escalações, gols, cartões, substituições)
  rawPayload: jsonb('raw_payload').notNull(),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  index('idx_ms_status_league').on(t.status, t.leagueId),
  index('idx_ms_home_team').on(t.homeTeamId, t.leagueId),
  index('idx_ms_away_team').on(t.awayTeamId, t.leagueId),
  index('idx_ms_date').on(t.matchDate),
  index('idx_ms_league_round').on(t.leagueId, t.round),
  index('idx_ms_source_league').on(t.source, t.leagueId),
]);

// ─── PDF Files ─────────────────────────────────────────────────────────────────

export const pdfFiles = pgTable('pdf_files', {
  idJogo:       text('id_jogo').notNull(),
  type:         text('type').notNull(),   // 'sumula' | 'boletim' | 'relatorio'
  content:      bytea('content').notNull(),
  url:          text('url'),
  downloadedAt: timestamp('downloaded_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  primaryKey({ columns: [t.idJogo, t.type] }),
  index('idx_pdf_files_id_jogo').on(t.idJogo),
]);

// ─── Tipos inferidos ───────────────────────────────────────────────────────────

export type User            = typeof users.$inferSelect;
export type NewUser         = typeof users.$inferInsert;
export type Bolao           = typeof boloes.$inferSelect;
export type NewBolao        = typeof boloes.$inferInsert;
export type Palpite         = typeof palpites.$inferSelect;
export type NewPalpite      = typeof palpites.$inferInsert;
export type Score           = typeof scores.$inferSelect;
export type NewScore        = typeof scores.$inferInsert;
export type BrazilRanking   = typeof brazilRankings.$inferSelect;
export type NewBrazilRanking = typeof brazilRankings.$inferInsert;
export type Post            = typeof posts.$inferSelect;
export type NewPost         = typeof posts.$inferInsert;
export type MatchSnapshot   = typeof matchSnapshots.$inferSelect;
export type NewMatchSnapshot = typeof matchSnapshots.$inferInsert;
export type PdfFile         = typeof pdfFiles.$inferSelect;
export type NewPdfFile      = typeof pdfFiles.$inferInsert;
