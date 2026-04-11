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
**Correct approach**: Always use JSON/OMM format from CelesTrak with `json2satrec()` from satellite.js v7. Never use `twoline2satrec()` with TLE text strings for new code.

### CelesTrak CORS Is Disabled
**What**: CelesTrak's API does not send CORS headers. Browser-side `fetch()` calls will fail silently or throw CORS errors.
**Why**: CelesTrak is a data mirror service, not designed as a browser API. They expect server-side consumers.
**Correct approach**: All CelesTrak requests must go through the Express backend. Never fetch CelesTrak data directly from React components.

### DONKI Notifications 30-Day Cap
**What**: The DONKI `/notifications` endpoint silently truncates query windows longer than 30 days. You get no error — just missing data.
**Why**: The notifications endpoint is designed for recent event monitoring, not historical research.
**Correct approach**: When querying DONKI notifications, always ensure `startDate` to `endDate` spans ≤ 30 days. For longer ranges, use the specific event endpoints (`/FLR`, `/CME`, `/GST`) which don't have this limitation.

### NASA DEMO_KEY Rate Limits Are Per-IP
**What**: The `DEMO_KEY` allows only 30 requests/hour and 50/day per IP. A registered key gives 1,000/hour.
**Why**: `DEMO_KEY` is for quick testing only. NASA throttles it aggressively.
**Correct approach**: Always register a free key at api.nasa.gov and set it as `NASA_API_KEY` in `.env`. The registration is instant with no approval process.

### satellite.js v7 Is ESM-Only
**What**: satellite.js v7 dropped CommonJS support. `require('satellite.js')` will fail.
**Why**: The v7 rewrite moved to TypeScript with ESM-only output for tree-shaking and modern tooling.
**Correct approach**: Ensure `"type": "module"` in package.json. Use `import` syntax. If you must use CommonJS, pin to satellite.js v5 (not recommended).

## Environment Gotchas
- SWPC endpoints have no auth but data staleness matters — X-ray flux updates every 1 min, but polling faster than every 5 min wastes requests with no new data
- CelesTrak data updates only ~3 times per day — polling more than every 2 hours is pointless and violates their usage policy
- NeoWs Feed endpoint has a maximum 7-day query window — wider ranges return an error

## Build & Tooling Gotchas
- react-globe.gl requires `three` as a peer dependency — it won't install automatically
- satellite.js v7 uses `radiansToDegrees()` for coordinate conversion — don't roll your own conversion, use the library function
- Hot reload doesn't pick up changes to `.env` — restart the dev server after modifying environment variables

## API Gotchas
- Space-Track rate limits are strict: 30 req/min, 300 req/hour. Violations trigger HTTP 500 errors AND email warnings. Use comma-delimited NORAD IDs in a single query instead of one request per satellite.
- Space-Track uses cookie-based auth via POST login — not Bearer tokens. The session cookie must be sent with subsequent requests.
- Space-Track full CDMs require an Orbital Data Request (ODR) or SSA Sharing Agreement — standard registered users only get `cdm_public` (limited data). Use CelesTrak SOCRATES for conjunction screening instead.
- NOAA SWPC endpoints return arrays sorted by time — the last element is the most recent reading
- DONKI `linkedEvents` field creates cause-and-effect chains (flare → CME → storm) — use this for risk cascading logic rather than manual time correlation
- N2YO positions endpoint returns max 300 seconds of data per request

## Third-Party Service Gotchas
- CelesTrak query parameters must be UPPERCASE: `CATNR`, `GROUP`, `FORMAT` — lowercase silently returns nothing
- NASA NeoWs groups results by close approach date, not by asteroid — iterate the date keys, not the top-level array
- EONET default status filter is `open` — use `status=all` explicitly for historical data
- NOAA SWPC `solar_probabilities.json` gives C/M/X flare probabilities as percentages, not decimals — don't divide by 100 again

## Historical Decisions (Context for "Why is it like this?")
- We use CelesTrak instead of Space-Track directly because CelesTrak mirrors the same data with zero auth, which eliminates account setup time during the 6-hour sprint
- We use node-cron instead of BullMQ because the MVP doesn't need Redis infrastructure — node-cron runs cron schedules in-process
- We use node-cache instead of Redis for the same reason — in-memory TTL cache is sufficient when data is re-fetched from live APIs on restart
- We skip real conjunction assessment and use CelesTrak SOCRATES reports instead — proper CDM analysis requires Space-Track SSA agreements and complex math
