# Spec Execution Log — Live Match Modal

**Branch:** feature/live-modal-x  
**Spec:** Live match modal (Form 1, independent visual)  
**Started:** 2026-05-11

---

## Decisions and Ambiguities Resolved

### 1. Rate limiter API shape

**What happened:** The spec uses `rateLimit(req, 'live-fixture')` as illustrative code. The actual `src/lib/rateLimiter.ts` exports named `Ratelimit` instances (`suggestionsLimiter`, `passwordResetLimiter`) plus `getClientIp()`. There is no generic `rateLimit()` function.

**Decision:** Added `liveFixtureLimiter` to `rateLimiter.ts` (slidingWindow, 20 req/min). Route handler uses `getClientIp(req)` + `liveFixtureLimiter.limit(ip)`, matching the `suggestionsLimiter` pattern exactly.

**Why:** Matches the actual codebase pattern; 20 req/min gives ample room for 15s polling while blocking abuse.

---

### 2. Fixture ID for live matches from MatchCard

**What happened:** `match.id` is the AF fixture ID for Série A, but CONMEBOL-sourced matches store a CONMEBOL internal ID in `match.id` with the AF fixture ID in the optional field `match.apiFootballFixtureId`.

**Decision:** Used `match.apiFootballFixtureId ?? Number(match.id)` as the `fixtureId` prop. For Série A (the primary live match source), both are the same. For CONMEBOL, uses the AF ID if available.

**Why:** Ensures the API call hits the correct fixture. Follows what the existing `match-events` route does for the same reason.

---

### 3. Live badge / click target placement

**What happened:** The spec says "near the score display." Live cards do not show a score — they show "VS" in the centre. There's already a green "Ao Vivo" badge in the card header.

**Decision:** Added a red "● AO VIVO" clickable button inside the centre VS area, below the "VS" text, only visible when `live === true`. This is the click target that opens the modal. The existing green "Ao Vivo" header badge is untouched.

**Why:** The centre area is the natural location (near where a score would appear). A button is explicit about interactivity without adding unexpected click targets on the whole card.

---

### 4. `ApiFixtureItemWithEvents` raw type and mapping

**What happened:** API-Football's `/fixtures?id=X` returns events and statistics in addition to the base fixture fields. The existing `ApiFixtureItem` does not include these.

**Decision:** Created `ApiFixtureItemWithEvents extends ApiFixtureItem` with `events: ApiFixtureEvent[]` and `statistics: ApiFixtureStatistics[]` arrays. Also added `ApiFixtureEvent` and `ApiFixtureStatistics` interfaces. Followed the `Api*` prefix convention in `apiFootball.ts`.

**Why:** Keeps the type hierarchy clean and additive; does not change `ApiFixtureItem` used by other functions.

---

### 5. `statusLabel` Portuguese mapping

**What happened:** Spec requires a `statusLabel` localized string derived from the raw status code. No mapping existed in the project.

**Decision:** Created an inline map inside `mapToLiveFixtureData()`:
- `1H` → "1º Tempo", `HT` → "Intervalo", `2H` → "2º Tempo"
- `ET` → "Prorrogação", `BT` → "Intervalo (Prorr.)", `P` → "Pênaltis"
- `FT`/`AET`/`PEN` → "Encerrado", `CANC` → "Cancelado"
- `PST` → "Adiado", `SUSP` → "Suspenso", default → raw status

**Why:** Self-contained inside the mapping function; no side effects elsewhere.

---

### 6. Stats API shape (possession as string vs number)

**What happened:** API-Football returns possession as a string like `"45%"` in the statistics array.

**Decision:** Strip the `%` and parse to number in `mapToLiveFixtureData`. Returns `null` if parsing fails.

**Why:** Matches what `LiveStats.possession` expects (number | null, percentage 0-100).

---

## Interventions

*(none so far)*
