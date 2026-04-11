# Gotchas & Non-Obvious Patterns

> **This is the highest-value document for developers and AI agents.** These are non-obvious patterns that cannot be inferred from reading the code alone.
>
> **Rules:**
> - Only include genuinely surprising or counterintuitive things
> - Always explain WHY the gotcha exists, not just what it is
> - Update this file every time someone makes a preventable mistake
> - Remove entries when the underlying issue is fixed

---

## Critical

### TLE Format 5-Digit Catalog Number Exhaustion
**Severity:** Will break satellite tracking ~July 2026
**What:** The legacy TLE text format only supports 5-digit NORAD catalog numbers (up to 99999). This limit will be exhausted around July 2026 at NORAD ID 69999.
**Why:** TLE is a fixed-width text format from the 1960s. The newer JSON/OMM format supports 9-digit catalog numbers.
**Impact:** Gateway's `satellites.ts` uses 3LE format with `twoline2satrec()`. This works for now but will need migration to JSON/OMM with `json2satrec()` before the limit hits.

### CelesTrak CORS Is Disabled
**Severity:** Silent failure in browser
**What:** CelesTrak's API does not send CORS headers. Browser-side `fetch()` calls fail silently or throw CORS errors.
**Why:** CelesTrak is a data mirror service, not designed as a browser API.
**Correct approach:** All CelesTrak requests go through `gateway/src/satellites.ts`. Never fetch CelesTrak data from React components.

### Inter-Service Auth Required for Agent Push
**Severity:** 403 errors on push
**What:** The gateway's `/internal/agent-push` validates the `x-internal-secret` header. Without it, pushes return 403.
**Why:** Prevents unauthorized data injection into risk state.
**Correct approach:** Both services load from the same `.env` file (path: `../../.env` relative to each package). If you see `[Push] Gateway push failed: 403`, check `INTERNAL_SECRET` matches in both services.

---

## Data Sources

### DONKI Notifications 30-Day Cap
**Severity:** Silent data truncation
**What:** The DONKI `/notifications` endpoint silently truncates query windows longer than 30 days. No error — just missing data.
**Why:** Designed for recent event monitoring, not historical research.
**Correct approach:** Use specific event endpoints (`/FLR`, `/CME`, `/GST`) which don't have this limitation.

### NASA DEMO_KEY Rate Limits
**Severity:** Quick exhaustion during development
**What:** `DEMO_KEY` allows only 30 requests/hour and 50/day per IP. A registered key gives 1,000/hour.
**Why:** `DEMO_KEY` is for quick testing only.
**Correct approach:** Register a free key at api.nasa.gov (instant, no approval). Set as `NASA_API_KEY` in `.env`.

### SWPC Data Staleness
**What:** SWPC endpoints update at fixed cadences — X-ray every 1 min, Kp/protons every 5 min.
**Why:** Polling faster than the update cadence wastes requests with no new data.
**Correct approach:** Agent polls SWPC every 5 minutes, which matches NOAA's update frequency.

### CelesTrak Update Frequency
**What:** CelesTrak data updates only ~3 times per day.
**Why:** TLEs are propagated from NORAD data, which updates infrequently.
**Correct approach:** Gateway refreshes TLEs every 2 hours. More frequent polling is pointless and may violate their usage policy.

### NeoWs Feed 7-Day Limit
**What:** NeoWs Feed endpoint has a maximum 7-day query window. Wider ranges return an error.
**Correct approach:** Keep `start_date` to `end_date` spans <= 7 days.

---

## Environment & Configuration

### LLM Briefs Are Optional
**What:** Without `ANTHROPIC_API_KEY` in `.env`, the agent never calls Claude. `shouldGenerateBrief()` returns `false` and the system uses deterministic fallback briefs.
**Why:** The LLM layer is designed as an enhancement, not a requirement.
**Impact:** Expect `MissionBrief` objects with `confidence: 0.5` and generic summaries without the key.

### dotenv Path Is Relative
**What:** Both services load `.env` from `../../.env` (relative to their `src/` directory). Changing the directory structure makes env vars silently empty.
**Why:** Monorepo uses a single shared `.env` at root, but each service runs from its own package directory.
**Correct approach:** Always run services from their package directory (`cd packages/agent && npm run dev`).

### Hot Reload Doesn't Pick Up .env Changes
**What:** Modifying `.env` while services are running has no effect.
**Why:** `dotenv` reads the file once at startup.
**Correct approach:** Restart the dev server after modifying environment variables.

---

## API-Specific

### Space-Track Rate Limits
**Severity:** Can get your account flagged
**What:** 30 req/min, 300 req/hour. Violations trigger HTTP 500 AND email warnings.
**Correct approach:** Use comma-delimited NORAD IDs in a single query instead of one request per satellite. (Currently using CelesTrak instead to avoid this.)

### Space-Track Auth Uses Cookies
**What:** Space-Track uses cookie-based auth via POST login, not Bearer tokens. The session cookie must be sent with subsequent requests.
**Note:** Not currently used (CelesTrak is our proxy), but relevant for Phase 2.

### SWPC Array Sorting
**What:** NOAA SWPC endpoints return arrays sorted by time — the last element is the most recent reading.
**Impact:** Always access `array[array.length - 1]` for current data, not `array[0]`.

### DONKI linkedEvents
**What:** `linkedEvents` field creates cause-and-effect chains (flare -> CME -> storm).
**Correct approach:** Use this for risk cascading logic rather than manual time correlation.

### CelesTrak Query Parameters Must Be UPPERCASE
**What:** Parameters like `CATNR`, `GROUP`, `FORMAT` must be UPPERCASE. Lowercase silently returns nothing.

### NeoWs Groups by Date, Not Asteroid
**What:** NeoWs groups results by close approach date, not by asteroid.
**Correct approach:** Iterate the date keys, not the top-level array.

### SWPC Solar Probabilities Are Percentages
**What:** `solar_probabilities.json` gives C/M/X flare probabilities as percentages (0-100), not decimals.
**Impact:** Don't divide by 100 again.

---

## Build & Tooling

### react-globe.gl Requires three.js
**What:** `three` is a peer dependency of react-globe.gl. It won't install automatically.
**Fix:** `npm install three` in the frontend package.

### Backend Uses CommonJS
**What:** Backend services use `"module": "commonjs"` in tsconfig.
**Why:** Required for satellite.js CommonJS compatibility with `esModuleInterop: true`.

### Global Socket Broadcast Pattern
**What:** Gateway broadcasts via `(global as any).__socketBroadcast` — a global callback.
**Why:** Pragmatic MVP pattern to avoid complex dependency injection.
**Note:** Not a best practice; refactor to proper DI post-MVP.

---

## Historical Decisions

These explain "why is it like this?" for patterns that might seem odd:

| Decision | Rationale |
|----------|-----------|
| CelesTrak instead of Space-Track | Zero auth required; eliminates account setup time during sprint |
| node-cron instead of BullMQ | No Redis infrastructure needed; in-process scheduling is sufficient |
| node-cache instead of Redis | In-memory TTL cache is sufficient when data is re-fetched on restart |
| Skip real conjunction assessment | Proper CDM analysis requires Space-Track SSA agreements and complex math |
| Two separate services | Agent can fail/restart without dropping WebSocket connections |
| `Promise.allSettled()` for initial fetch | One failing API shouldn't block all data loading |
