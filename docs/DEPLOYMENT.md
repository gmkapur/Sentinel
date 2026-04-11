# Deployment & Operations

## Environments

| Environment | URLs | Branch | Purpose |
|-------------|------|--------|---------|
| Development | `localhost:5173` / `:3001` / `:3002` | any | Local development |
| Production | TBD | `main` | Live deployment (post-MVP) |

---

## Sprint Plan

The MVP follows a structured 6-hour build sprint with clear phase boundaries.

### Phase 1: Foundation (Hour 1-2)
**Deliverable:** Agent fetching SWPC data and producing initial risk scores

- Scaffold monorepo with npm workspaces (gateway, agent, frontend, shared)
- Install dependencies, configure TypeScript
- Implement agent data cache and SWPC pollers (simplest — no auth, JSON endpoints)
- First risk engine evaluation with SWPC data

### Phase 2: Data Sources + Risk Engine (Hour 2-3)
**Deliverable:** Complete risk scoring with all data sources, agent pushing to gateway

- Add DONKI pollers (flares, CMEs, geomagnetic storms)
- Add NeoWs and EONET pollers
- Complete risk scoring engine with compound synergy rules
- Wire agent push to gateway
- Implement gateway satellite propagation (CelesTrak + satellite.js)

### Phase 3: Gateway + Real-Time (Hour 3-4)
**Deliverable:** Functioning REST API and WebSocket broadcasting

- Build gateway REST API routes
- Set up Socket.io broadcasting (risk-update, satellite-positions, space-weather)
- Implement agent state store and alert history
- Add LLM brief generation with Claude API

### Phase 4: Frontend (Hour 4-5)
**Deliverable:** Interactive 3D globe with real-time risk overlays

- Scaffold React app with Vite
- Implement GlobeView with react-globe.gl satellite rendering
- Build RiskBanner, AlertPanel, SpaceWeatherBar components
- Wire Socket.io hooks for real-time updates

### Phase 5: Polish (Hour 5-6)
**Deliverable:** Demo-ready application

- Error handling, graceful degradation when APIs are down
- Dark globe texture, responsive layout
- UI polish and final testing
- Deploy or prepare demo environment

### Minimum Shippable Definition

If the sprint runs behind schedule, features are cut in this priority order (cut first → cut last):

| Cut Order | Feature | Fallback |
|-----------|---------|----------|
| 1st cut | LLM mission briefs | Deterministic fallback briefs (already implemented) |
| 2nd cut | SpaceWeatherBar gauges | Show raw values in text; risk score still works |
| 3rd cut | 3D globe satellite rendering | 2D table of satellite positions with risk levels |
| 4th cut | EONET natural events layer | Non-critical for core risk scoring |
| 5th cut | Per-satellite risk enrichment | Show global risk score only |
| **Never cut** | Risk scoring engine | Core value proposition — ship with SWPC-only if needed |
| **Never cut** | Agent → Gateway push pipeline | Without this, nothing works |
| **Never cut** | WebSocket real-time updates | Core differentiator vs. static dashboards |

### Sprint Assignments

| Phase | Owner | Deliverable | Integration Checkpoint |
|-------|-------|-------------|----------------------|
| Phase 1: Foundation | Backend lead | Monorepo scaffold, agent SWPC poller, first risk score | `curl :3002/status` returns valid JSON with risk score |
| Phase 2: Data + Risk | Backend lead | All pollers, complete risk engine, agent push | **CHECKPOINT: `curl -X POST :3001/internal/agent-push` triggers Socket.io event visible in browser DevTools before proceeding to frontend** |
| Phase 3: Gateway + RT | Full-stack | REST API, Socket.io, alert history, LLM briefs | `curl :3001/api/v1/status` returns populated risk + weather + satellite count |
| Phase 4: Frontend | Frontend lead | Globe, RiskBanner, AlertPanel, SpaceWeatherBar | Globe renders with satellites colored by risk level |
| Phase 5: Polish | All | Error handling, dark theme, responsive layout | Full demo walkthrough completes without errors |

### Explicitly Deferred (Do Not Attempt During Sprint)

| Feature | Status | Rationale |
|---------|--------|-----------|
| BullMQ / Redis | Deferred | Use node-cron + node-cache instead |
| Space-Track registration | Deferred | Use CelesTrak (zero auth) |
| ESA DISCOS | Deferred | Restricted access, long approval |
| Database persistence | **Done** | PostgreSQL + Prisma ORM (gateway) |
| Conjunction assessment | **Done** | TLE-based SGP4 proximity detection |
| Docker | **Done** | Multi-stage Dockerfiles + docker-compose.yml |
| Tests | **Done** | 156 tests across 8 test files (vitest) |

---

## CI Pipeline (GitHub Actions)

**Config:** `.github/workflows/ci.yml`

```
Trigger: push to any branch, pull request to main

Jobs (parallel where possible):
  lint:
    1. Install dependencies (npm ci, cached)
    2. ESLint check
    3. Prettier format check

  test:
    1. Install dependencies (npm ci, cached)
    2. Run unit tests (vitest)
    3. Run coverage report
    4. Upload coverage artifact

  build:
    1. Install dependencies (npm ci, cached)
    2. Build shared → agent → gateway → frontend

  docker (depends on lint + test + build):
    1. Build agent Docker image
    2. Build gateway Docker image
    3. Build frontend Docker image
```

---

## Running the Application

### Development

```bash
# Start all three services (separate terminals)
cd packages/agent && npm run dev     # Agent on :3002
cd packages/gateway && npm run dev   # Gateway on :3001
cd packages/frontend && npm run dev  # Frontend on :5173
```

The agent should start before or alongside the gateway — the first push will fail if the gateway isn't ready, but subsequent cycles succeed.

### Production Build (Manual)

```bash
# Build
cd packages/agent && npm run build
cd packages/gateway && npm run build
cd packages/frontend && npm run build

# Run
cd packages/agent && npm start       # Agent on :3002
cd packages/gateway && npm start     # Gateway on :3001
# Serve frontend dist/ with static server or integrate into gateway
```

### Docker Deployment

Each service has its own multi-stage Dockerfile. A `docker-compose.yml` at the repo root orchestrates all services including PostgreSQL.

```bash
# Build and start all services
docker compose up --build -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Stop and remove data volumes
docker compose down -v
```

**Environment variables:** Set via `.env` file or export before `docker compose up`:
```bash
export NASA_API_KEY=your-key
export ANTHROPIC_API_KEY=sk-ant-...
export INTERNAL_SECRET=strong-random-secret
export API_KEY=your-production-api-key
docker compose up --build -d
```

| Service | Container | Port | Dockerfile |
|---------|-----------|------|------------|
| PostgreSQL | `postgres` | 5432 | Official `postgres:16-alpine` |
| Agent | `agent` | 3002 | `packages/agent/Dockerfile` |
| Gateway | `gateway` | 3001 | `packages/gateway/Dockerfile` |
| Frontend | `frontend` | 80 | `packages/frontend/Dockerfile` (nginx) |

**Gateway auto-migrates:** The gateway container runs `prisma migrate deploy` on startup, creating all required tables automatically.

**Health checks:** All containers include Docker `HEALTHCHECK` instructions. PostgreSQL checks `pg_isready`, agent/gateway check their `/health` endpoint, frontend checks nginx response.

---

## Infrastructure Requirements

### Hosting Provider Requirements

| Requirement | Reason |
|-------------|--------|
| WebSocket support | Socket.io on gateway |
| Persistent processes | Cron pollers run continuously (not serverless) |
| Outbound HTTPS | External API calls (SWPC, DONKI, CelesTrak, NeoWs, Claude) |
| Two Node.js processes | Agent + gateway as separate services |

### Candidate Providers

Railway, Fly.io, Render — all support Node.js + WebSocket + persistent processes.

---

## Monitoring

### Health Checks

| Service | Endpoint | What It Returns |
|---------|----------|----------------|
| Agent | `GET :3002/health` | Uptime, last poll timestamps, cache stats |
| Gateway | `GET :3001/api/v1/status` | Risk state, brief, weather, satellite count |
| Agent via Gateway | `GET :3001/api/v1/agent/health` | Proxied health check |

### Logging

| Aspect | Detail |
|--------|--------|
| **Output** | stdout (`console.log`) |
| **Format** | Structured JSON via pino with `{ component }` child loggers |
| **Prefixes** | `[SWPC]`, `[DONKI]`, `[NeoWs]`, `[EONET]`, `[RiskEngine]`, `[LLM]`, `[Push]`, `[Gateway]`, `[Socket]`, `[Satellites]` |
| **What to log** | Poller successes/failures with data counts, risk evaluations with scores, LLM brief generation, push results, Socket.io connection counts |

---

## Demo Preparation

### Risk Checklist

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | CelesTrak down — no satellites | Low | High | Pre-cache TLE snapshot as fixture; load from file on failure |
| 2 | NOAA SWPC down — no weather data | Low | High | Pre-cache SWPC responses; risk engine scores from stale cache |
| 3 | NASA DONKI down — no events | Low | Medium | Core scoring works via SWPC real-time data |
| 4 | Claude API expired / no credits | Medium | Medium | Deterministic fallback briefs activate automatically |
| 5 | NASA rate limit hit (DEMO_KEY) | Medium | Medium | Register free key (1,000/hr); pre-cache NeoWs data |
| 6 | WebGL fails in demo browser | Low | Critical | Test on demo machine; keep screen recording as backup |
| 7 | Network down at demo venue | Medium | Critical | Run locally; pre-cache all API responses; fully offline from cache |
| 8 | Port conflicts on demo machine | Low | Low | Configure alternate ports via `.env`; test 30 min before |
| 9 | Socket.io connection fails | Low | Medium | Frontend falls back to REST polling on 10s interval |
| 10 | No interesting space weather | High | Medium | Prepare May 2024 G5 storm fixture dataset |

### Execution Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 11 | react-globe.gl integration takes >2 hours | Medium | High | Fallback to 2D Leaflet map with satellite markers; risk scoring still works |
| 12 | Agent-gateway push debugging takes >30 min | Medium | High | Defer LLM briefs and ship with deterministic fallback only; verify push with `curl` before proceeding |
| 13 | Team member unavailable mid-sprint | Low | High | All phases have a single owner; if blocked, skip to next phase and backfill |
| 14 | Socket.io CORS issues between Vite dev server and gateway | High | Low | Vite proxy config handles this; if broken, `cors({ origin: '*' })` in dev mode only |
| 15 | satellite.js CommonJS import fails with ESM config | Medium | Medium | Use `esModuleInterop: true` in tsconfig; test import in isolation before wiring into gateway |
| 16 | LLM brief generation exceeds 10s timeout on first call | High | Low | Increase timeout to 35s; deterministic fallback activates automatically; LLM briefs are not blocking |

### Pre-Demo Checklist

```bash
# 1. Verify all services start
cd packages/agent && npm run dev     # Watch for poller success logs
cd packages/gateway && npm run dev   # Watch for TLE fetch + satellite count
cd packages/frontend && npm run dev  # Verify globe renders

# 2. Verify data flow
curl http://localhost:3002/health              # Agent pollers running
curl http://localhost:3001/api/v1/status           # Risk state populated
curl http://localhost:3001/api/v1/satellites       # Satellite positions available

# 3. Verify LLM briefs
curl http://localhost:3001/api/v1/agent/brief      # Brief available (or fallback)

# 4. Cache snapshot for offline fallback
curl http://localhost:3002/data/swpc-xray > fixtures/swpc-xray.json
curl http://localhost:3002/data/donki-flares > fixtures/donki-flares.json
curl http://localhost:3001/api/v1/satellites > fixtures/satellites.json
```

### Historical Storm Demo Scenario

For the most compelling demo, prepare a fixture dataset from the **May 10-12, 2024 G5 geomagnetic storm** (strongest in 21 years):

| Signal | Value | Score |
|--------|-------|-------|
| X-ray flux | X5.8 flare (May 11) | `solarFlare: +40` |
| Kp index | 9 (G5 extreme) | `geomagneticStorm: +30` |
| Proton flux | >1000 pfu | `radiationStorm: +25` |
| Compound: M5+ AND Kp >= 5 | — | `+15` |
| Compound: Kp >= 7 AND protons >= 100 | — | `+20` |
| Compound: M5+ sunlit | — | `+10` |
| **Total** | — | **100+ (capped at 100) = CRITICAL** |

**Expected brief:** NO-GO with detailed multi-threat analysis.

This demonstrates exactly the kind of compound event where Orbit Sentinel provides value that raw NOAA dashboards do not.

---

## Secrets Management

| Secret | Storage | Notes |
|--------|---------|-------|
| `NASA_API_KEY` | `.env` (dev), platform env (prod) | Free, instant registration |
| `ANTHROPIC_API_KEY` | `.env` (dev), platform env (prod) | Has billing — treat as sensitive |
| `INTERNAL_SECRET` | `.env` (dev), platform env (prod) | Use strong random value in production |

Never commit `.env` files or API keys to git.
