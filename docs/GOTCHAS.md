# Things That Will Bite You

> This is the **highest-value document for AI agents**. These are non-obvious patterns
> that cannot be inferred from reading the code alone.
>
> **Rules for this file:**
> - Only include genuinely surprising or counterintuitive things
> - Always explain WHY the gotcha exists, not just what it is
> - Update this file every time an agent (or human) makes a preventable mistake
> - Remove entries when the underlying issue is fixed

## Critical Gotchas

### TLE Format 5-Digit Catalog Number Exhaustion
**What**: The legacy TLE text format only supports 5-digit NORAD catalog numbers (up to 99999). This limit will be exhausted around July 2026 at NORAD ID 69999.
**Why**: TLE is a fixed-width text format from the 1960s. The newer JSON/OMM format supports 9-digit catalog numbers.
**Current approach**: The gateway uses 3LE format with `twoline2satrec()` for SGP4 propagation. This works for now but will need migration to JSON/OMM with `json2satrec()` before the catalog number limit is reached.

### CelesTrak CORS Is Disabled
**What**: CelesTrak's API does not send CORS headers. Browser-side `fetch()` calls will fail silently or throw CORS errors.
**Why**: CelesTrak is a data mirror service, not designed as a browser API. They expect server-side consumers.
**Correct approach**: All CelesTrak requests go through the gateway's `satellites.ts` module. Never fetch CelesTrak data directly from React components.

### DONKI Notifications 30-Day Cap
**What**: The DONKI `/notifications` endpoint silently truncates query windows longer than 30 days. You get no error — just missing data.
**Why**: The notifications endpoint is designed for recent event monitoring, not historical research.
**Correct approach**: The agent pollers use specific event endpoints (`/FLR`, `/CME`, `/GST`) which don't have this limitation. When querying, always keep `startDate` to `endDate` spans ≤ 30 days for notifications.

### NASA DEMO_KEY Rate Limits Are Per-IP
**What**: The `DEMO_KEY` allows only 30 requests/hour and 50/day per IP. A registered key gives 1,000/hour.
**Why**: `DEMO_KEY` is for quick testing only. NASA throttles it aggressively.
**Correct approach**: Always register a free key at api.nasa.gov and set it as `NASA_API_KEY` in `.env`. The registration is instant with no approval process.

### Inter-Service Auth Is Required for Agent Push
**What**: The gateway's `/internal/agent-push` endpoint validates the `x-internal-secret` header. Without it, pushes return 403.
**Why**: Prevents unauthorized data injection into the risk state. Even in dev, both services must share the same `INTERNAL_SECRET` from `.env`.
**Correct approach**: Both agent and gateway load from the same `.env` file (path: `../../.env` relative to each package). If you see `[Push] Gateway push failed: Request failed with status code 403`, check that `INTERNAL_SECRET` matches.

### LLM Briefs Are Optional
**What**: Without `ANTHROPIC_API_KEY` in `.env`, the agent never calls Claude. `shouldGenerateBrief()` returns `false` and the system uses deterministic fallback briefs.
**Why**: The LLM layer is designed as an enhancement, not a requirement. The risk scoring engine works independently.
**Correct approach**: For development without an API key, expect `MissionBrief` objects with `confidence: 0.5` and generic summaries. Set the key to get full contextual briefs.

### dotenv Path Is Relative
**What**: Both agent and gateway load `.env` from `../../.env` (relative to their `src/` directory). If you change the directory structure, env vars will silently be empty.
**Why**: The monorepo uses a single shared `.env` at the root, but each service runs from its own package directory.
**Correct approach**: Always run services from their package directory (`cd packages/agent && npm run dev`). If env vars are missing, check the `dotenv.config({ path: '../../.env' })` call in each service's `index.ts`.

## Environment Gotchas
- SWPC endpoints have no auth but data staleness matters — X-ray flux updates every 1 min, but polling faster than every 5 min wastes requests with no new data
- CelesTrak data updates only ~3 times per day — polling more than every 2 hours is pointless and violates their usage policy
- NeoWs Feed endpoint has a maximum 7-day query window — wider ranges return an error
- EONET defaults to `status=open` — use `status=all` explicitly for historical data

## Build & Tooling Gotchas
- react-globe.gl requires `three` as a peer dependency — it won't install automatically
- Hot reload doesn't pick up changes to `.env` — restart the dev server after modifying environment variables
- Backend services use CommonJS (`"module": "commonjs"` in tsconfig) — use `require`-compatible imports with `esModuleInterop: true`
- The gateway broadcasts via a global callback (`(global as any).__socketBroadcast`) — this is a pragmatic MVP pattern, not a best practice

## API Gotchas
- Space-Track rate limits are strict: 30 req/min, 300 req/hour. Violations trigger HTTP 500 errors AND email warnings. Use comma-delimited NORAD IDs in a single query instead of one request per satellite.
- Space-Track uses cookie-based auth via POST login — not Bearer tokens. The session cookie must be sent with subsequent requests.
- NOAA SWPC endpoints return arrays sorted by time — the last element is the most recent reading
- DONKI `linkedEvents` field creates cause-and-effect chains (flare → CME → storm) — use this for risk cascading logic rather than manual time correlation
- CelesTrak query parameters must be UPPERCASE: `CATNR`, `GROUP`, `FORMAT` — lowercase silently returns nothing
- NASA NeoWs groups results by close approach date, not by asteroid — iterate the date keys, not the top-level array
- NOAA SWPC `solar_probabilities.json` gives C/M/X flare probabilities as percentages, not decimals — don't divide by 100 again

## Historical Decisions (Context for "Why is it like this?")
- We use CelesTrak instead of Space-Track directly because CelesTrak mirrors the same data with zero auth, which eliminates account setup time during the 6-hour sprint
- We use node-cron instead of BullMQ because the MVP doesn't need Redis infrastructure — node-cron runs cron schedules in-process
- We use node-cache instead of Redis for the same reason — in-memory TTL cache is sufficient when data is re-fetched from live APIs on restart
- We skip real conjunction assessment and use CelesTrak SOCRATES reports instead — proper CDM analysis requires Space-Track SSA agreements and complex math
- The agent and gateway are separate services so the agent can fail/restart without dropping WebSocket connections
- `Promise.allSettled()` is used for initial fetch so one failing API doesn't block all data loading
