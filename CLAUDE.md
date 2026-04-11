# Sentinel

## What This Is
Orbit Sentinel is a real-time space situational awareness (SSA) dashboard that fuses publicly available space weather and orbital data into a compound risk scoring system with 3D globe visualization. The system ingests data from NOAA SWPC, NASA DONKI, CelesTrak, and NASA NeoWs to compute a 0–100 risk score using a multi-signal fusion engine with compound synergy rules (e.g., M5+ flare coinciding with LEO satellite on sunlit side). An LLM reasoning layer via Claude Sonnet generates structured GO/CAUTION/NO-GO mission briefs when risk levels change or score deltas exceed thresholds. It serves university CubeSat teams, independent satellite operators, space enthusiasts, and mission planners.

## Commands
```bash
# Install all dependencies (workspace root)
npm install

# Start agent service (port 3002)
cd packages/agent && npm run dev

# Start gateway service (port 3001)
cd packages/gateway && npm run dev

# Start frontend (Vite dev server)
cd packages/frontend && npm run dev

# Lint / format check
npm run lint
npm run format:check
```

## How It Runs
- **Two-service architecture**: Gateway (:3001) serves frontend + WebSocket; Agent (:3002) runs pollers + risk engine + LLM briefs
- **Entrypoints**: `packages/gateway/src/index.ts` (Express + Socket.io), `packages/agent/src/index.ts` (Express + cron pollers), `packages/frontend/src/App.tsx` (React)
- **Core flow**: Agent cron pollers fetch SWPC/DONKI/NeoWs/EONET data → in-memory cache (node-cache) → risk scoring engine fuses data into 0–100 score → Claude LLM generates mission brief → Agent POSTs to gateway `/internal/agent-push` → Socket.io broadcasts to React frontend → 3D globe + alert panels
- **Key modules**:
  - `packages/agent/src/pollers/` — cron-scheduled data fetchers (swpc.ts, donki.ts, neows.ts, eonet.ts)
  - `packages/agent/src/riskEngine.ts` — multi-source data fusion and 0–100 scoring
  - `packages/agent/src/llmBrief.ts` — Claude API integration for structured mission briefs
  - `packages/agent/src/dataCache.ts` — node-cache wrapper with source-specific TTLs
  - `packages/agent/src/push.ts` — HTTP push to gateway
  - `packages/gateway/src/routes.ts` — REST endpoints (`/api/status`, `/api/satellites`, `/api/alerts`, `/api/space-weather`)
  - `packages/gateway/src/satellites.ts` — TLE cache + SGP4 propagation via satellite.js
  - `packages/gateway/src/agentState.ts` — in-memory store for latest agent push + alert history
  - `packages/frontend/src/components/` — GlobeView, RiskBanner, AlertPanel, SpaceWeatherBar
  - `packages/shared/types.ts` — shared TypeScript interfaces used by both services

## Things That Will Bite You
- CelesTrak has CORS disabled — all CelesTrak requests must go through the backend, never from the browser
- TLE format's 5-digit NORAD catalog number limit exhausts ~July 2026 — use JSON/OMM format where possible
- DONKI Notifications endpoint is capped at 30-day query ranges — longer windows silently truncate
- `DEMO_KEY` for NASA APIs allows only 30 req/hour and 50/day per IP — register a free key for 1,000 req/hour
- SWPC JSON endpoints have no auth but return stale data if polled faster than their update cadence — respect poll intervals (5 min for X-ray/Kp, 15 min for protons)
- Space-Track rate limits are strict: 30 req/min, 300 req/hour — violations trigger HTTP 500 and email warnings
- Inter-service communication uses `INTERNAL_SECRET` header — both services must share the same secret from `.env`
- Without `ANTHROPIC_API_KEY`, the agent uses deterministic fallback briefs instead of LLM-generated ones

## Code Conventions
- Runtime: Node.js (not Bun/Deno)
- Language: TypeScript (strict mode, ES2022 target, CommonJS module)
- Monorepo: npm workspaces with `packages/gateway`, `packages/agent`, `packages/frontend`, `packages/shared`
- All external API calls go through server-side pollers in the agent, never from the client
- Risk scores use NOAA's established thresholds (M5+ flare, Kp ≥ 5, ≥10 pfu)
- Inter-service auth: `x-internal-secret` header on `/internal/agent-push`

## Detailed Docs
- Project mission & goals: `docs/PROJECT_OVERVIEW.md`
- Project evaluation & scores: `docs/PROJECT_EVALUATION.md`
- System architecture: `docs/ARCHITECTURE.md`
- Tech stack & dependencies: `docs/TECH_STACK.md`
- Development setup: `docs/DEVELOPMENT.md`
- Testing strategy: `docs/TESTING.md`
- Code conventions: `docs/CONVENTIONS.md`
- Non-obvious gotchas: `docs/GOTCHAS.md`
- API reference: `docs/API_REFERENCE.md`
- Deployment & CI/CD: `docs/DEPLOYMENT.md`
- Security boundaries: `docs/SECURITY.md`
