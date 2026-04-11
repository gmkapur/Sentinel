# Sentinel

## What This Is
Orbit Sentinel is a satellite mission risk analysis platform that fuses real-time space weather data, orbital tracking, and 3D visualization into a unified risk dashboard. It serves satellite operators, space enthusiasts, and mission planners by scoring compound radiation and geomagnetic threats to orbital assets.

## Commands
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Production build
npm run build

# Run all tests
npm test

# Lint / format check
npm run lint
```

## How It Runs
- **Entrypoint**: `server/index.js` (Express + Socket.io backend), `src/App.jsx` (React frontend)
- **Core flow**: Cron pollers fetch SWPC/DONKI/CelesTrak data → in-memory cache (node-cache) → risk scoring engine fuses data into 0–100 score → Socket.io broadcasts level changes → React frontend renders 3D globe + alert panels
- **Key modules**:
  - `server/pollers/` — cron-scheduled data fetchers (SWPC, DONKI, CelesTrak, NeoWs)
  - `server/risk-engine.js` — multi-source data fusion and 0–100 scoring
  - `server/routes/` — Express REST endpoints (`/api/status`, `/api/space-weather`, `/api/alerts`, `/api/satellite/:id`)
  - `src/components/Globe.jsx` — react-globe.gl 3D satellite visualization
  - `src/components/AlertPanel.jsx` — real-time risk display with Socket.io

## Things That Will Bite You
- CelesTrak has CORS disabled — all CelesTrak requests must go through the backend, never from the browser
- TLE format's 5-digit NORAD catalog number limit exhausts ~July 2026 — always use JSON/OMM format, never parse legacy TLE text strings
- DONKI Notifications endpoint is capped at 30-day query ranges — longer windows silently truncate
- `DEMO_KEY` for NASA APIs allows only 30 req/hour and 50/day per IP — register a free key for 1,000 req/hour
- SWPC JSON endpoints have no auth but return stale data if polled faster than their update cadence — respect poll intervals (5 min for X-ray/Kp, 15 min for protons)
- Space-Track rate limits are strict: 30 req/min, 300 req/hour — violations trigger HTTP 500 and email warnings

## Code Conventions
- Runtime: Node.js (not Bun/Deno)
- Use JSON/OMM format from CelesTrak, not TLE text strings
- Use `satellite.js` v7 with `json2satrec()` for OMM parsing
- All external API calls go through server-side pollers, never from the client
- Risk scores use NOAA's established thresholds (M5+ flare, Kp ≥ 5, ≥10 pfu)

## Detailed Docs
- Project mission & goals: `docs/PROJECT_OVERVIEW.md`
- System architecture: `docs/ARCHITECTURE.md`
- Tech stack & dependencies: `docs/TECH_STACK.md`
- Development setup: `docs/DEVELOPMENT.md`
- Testing strategy: `docs/TESTING.md`
- Code conventions: `docs/CONVENTIONS.md`
- Non-obvious gotchas: `docs/GOTCHAS.md`
- API reference: `docs/API_REFERENCE.md`
- Deployment & CI/CD: `docs/DEPLOYMENT.md`
- Security boundaries: `docs/SECURITY.md`
