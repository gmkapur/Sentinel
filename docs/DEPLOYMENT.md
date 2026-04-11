# Deployment & CI/CD

## Environments

| Environment | URL | Branch | Auto-deploy? | Purpose |
|-------------|-----|--------|-------------- |---------|
| Development | `localhost:5173` (frontend), `localhost:3001` (gateway), `localhost:3002` (agent) | — | — | Local dev |
| Production | TBD | `main` | No | Live deployment (post-MVP) |

## 6-Hour Sprint Plan

The MVP follows a structured 6-hour build sprint:

### Hour 1–2: Foundation
- Scaffold monorepo with npm workspaces (gateway, agent, frontend, shared)
- Install dependencies, set up TypeScript configs
- Implement agent data cache and SWPC pollers (simplest — no auth, JSON endpoints)
- First risk engine evaluation with SWPC data

### Hour 2–3: Risk Engine + Data Sources
- Add DONKI pollers (flares, CMEs, geomagnetic storms)
- Add NeoWs and EONET pollers
- Complete risk scoring engine with compound rules
- Wire agent push to gateway
- Implement gateway satellite propagation (CelesTrak + satellite.js)

### Hour 3–4: Gateway + Socket.io
- Build gateway REST API routes
- Set up Socket.io broadcasting (risk-update, satellite-positions, space-weather)
- Implement agent state store and alert history
- Add LLM brief generation with Claude API

### Hour 4–5: Frontend
- Scaffold React app with Vite
- Implement GlobeView with react-globe.gl satellite rendering
- Build RiskBanner, AlertPanel, SpaceWeatherBar components
- Wire Socket.io hooks for real-time updates

### Hour 5–6: Polish
- Error handling, graceful degradation when APIs are down
- Dark globe texture, responsive layout
- UI polish
- Deploy

### What to Skip for MVP
- BullMQ/Redis (use node-cron + node-cache)
- Space-Track registration (use CelesTrak)
- ESA DISCOS (restricted access)
- Database persistence (in-memory is fine)
- Real conjunction assessment (use SOCRATES reports)
- Docker
- Tests

## CI Pipeline

### Current Pipeline (GitHub Actions)
```
1. Trigger: push to any branch, pull request to main
2. Install dependencies (npm ci)
3. Lint check (npm run lint)
4. Format check (npm run format:check)
```

**Config location**: `.github/workflows/lint.yml`

### Planned Pipeline Steps (Post-MVP)
```
1. Install dependencies (npm ci, cached)
2. Lint check (npm run lint)
3. Format check (npm run format:check)
4. Unit tests (npm test)
5. Build all packages (npm run build in each workspace)
6. (on main) Deploy
```

## Deployment Process

### Development
```bash
# Start all three services (in separate terminals)
cd packages/agent && npm run dev     # Agent on :3002
cd packages/gateway && npm run dev   # Gateway on :3001
cd packages/frontend && npm run dev  # Frontend on :5173
```

The agent must start before or alongside the gateway — the first push will fail if the gateway isn't ready, but subsequent cycles will succeed.

### Production Build
```bash
# Build backend services
cd packages/agent && npm run build
cd packages/gateway && npm run build

# Build frontend
cd packages/frontend && npm run build

# Start in production
cd packages/agent && npm start       # Agent on :3002
cd packages/gateway && npm start     # Gateway on :3001
# Serve frontend dist/ with any static server or integrate into gateway
```

### Rollback
Not applicable for MVP (local development only). Post-MVP: redeploy previous git tag.

## Infrastructure

### Hosting
- **Provider**: TBD for production. Options: Railway, Fly.io, Render (all support Node.js + WebSocket)
- **Compute**: Two Node.js processes (agent + gateway)
- **Region**: Closest to user (latency not critical — data is cached)

### Requirements for Hosting Provider
- Must support WebSocket connections (Socket.io on gateway)
- Must support persistent processes (not serverless — cron pollers need to run continuously)
- Must allow outbound HTTPS requests to external APIs (SWPC, DONKI, CelesTrak, NeoWs, EONET, Claude)
- Must support two separate Node.js processes or containers (agent + gateway)

### DNS & CDN
- Not configured for MVP
- Post-MVP: Cloudflare for DNS + caching of static assets

## Monitoring & Alerting

### Health Checks
- **Agent**: `GET http://localhost:3002/health` — returns uptime, last poll timestamps, cache stats
- **Gateway**: `GET http://localhost:3001/api/status` — returns risk state, brief, space weather, satellite count
- **Agent via Gateway**: `GET http://localhost:3001/api/agent/health` — proxied health check

### Logs
- **Location**: stdout (console.log)
- **Format**: Plaintext with `[Module]` prefix for MVP, structured JSON post-MVP
- **What to log**: Poller successes/failures with data counts, risk engine evaluations with scores, LLM brief generation, gateway push results, Socket.io connection counts
- **Log prefixes**: `[SWPC]`, `[DONKI]`, `[NeoWs]`, `[EONET]`, `[RiskEngine]`, `[LLM]`, `[Push]`, `[Gateway]`, `[Socket]`, `[Satellites]`

## Demo-Day Risk Checklist

Mitigations for common demo failures. Each risk has a concrete fallback.

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | **CelesTrak down** — no satellite positions on globe | Low | High | Pre-cache TLE snapshot as `fixtures/tle-cache.json`; load from file if CelesTrak fetch fails |
| 2 | **NOAA SWPC down** — no X-ray/Kp/proton data | Low | High | Pre-cache last-known SWPC responses as fixtures; risk engine scores from stale cache |
| 3 | **NASA DONKI down** — no flare/CME events | Low | Medium | Core scoring still works via SWPC real-time data; DONKI adds event history |
| 4 | **Claude API key expired / no credits** | Medium | Medium | Deterministic fallback briefs activate automatically; demo the fallback as a feature |
| 5 | **NASA API rate limit hit** (DEMO_KEY: 30/hr) | Medium | Medium | Register a free key (1,000/hr) before demo; pre-cache NeoWs data as fixture |
| 6 | **WebGL fails in demo browser** (react-globe.gl) | Low | Critical | Test on demo machine beforehand; have a screen recording of the globe as backup |
| 7 | **Network/WiFi down** at demo venue | Medium | Critical | Run all services locally; pre-cache all API responses; demo works fully offline from cache |
| 8 | **Port conflicts** on demo machine | Low | Low | Configure alternate ports via `.env`; test startup on demo machine 30 min before |
| 9 | **Socket.io connection fails** | Low | Medium | Frontend falls back to REST polling via `/api/status` on 10s interval |
| 10 | **No interesting space weather** during demo | High | Medium | Prepare a fixture dataset from the **May 2024 G5 geomagnetic storm** showing what scores and NO-GO brief the system would have generated |

### Pre-Demo Checklist

```bash
# 1. Verify all services start cleanly
cd packages/agent && npm run dev     # Watch for poller success logs
cd packages/gateway && npm run dev   # Watch for TLE fetch + satellite count
cd packages/frontend && npm run dev  # Verify globe renders in target browser

# 2. Verify data flow
curl http://localhost:3002/health              # Agent pollers running
curl http://localhost:3001/api/status           # Risk state populated
curl http://localhost:3001/api/satellites       # Satellite positions available

# 3. Verify LLM briefs (if using Claude)
curl http://localhost:3001/api/agent/brief      # Brief available (or fallback)

# 4. Cache snapshot for offline fallback
curl http://localhost:3002/data/swpc-xray > fixtures/swpc-xray.json
curl http://localhost:3002/data/donki-flares > fixtures/donki-flares.json
curl http://localhost:3001/api/satellites > fixtures/satellites.json
```

### Historical Storm Scenario

For the most compelling demo, prepare a fixture dataset from the **May 10–12, 2024 G5 geomagnetic storm** — the strongest storm in 21 years:
- X-ray flux: X5.8 flare (May 11) → `solarFlare: +40`
- Kp index: 9 (G5 extreme) → `geomagneticStorm: +30`
- Proton flux: >1000 pfu → `radiationStorm: +25`
- Compound bonuses: M5+ AND Kp≥5 (+15) + Kp≥7 AND protons≥100 (+20) + M5+ sunlit (+10)
- **Expected score: 100+ (capped at 100) = CRITICAL**
- **Expected brief: NO-GO** with detailed threat analysis

This demonstrates exactly the kind of compound event where Orbit Sentinel provides value that raw NOAA dashboards do not.

## Secrets Management
- **Tool**: `.env` file (local development), platform env vars (production)
- **Never committed**: `.env` files, API keys
- **Required secrets**: `NASA_API_KEY` (free, instant registration at api.nasa.gov)
- **Optional secrets**: `ANTHROPIC_API_KEY` (Claude API for LLM briefs)
- **Internal secret**: `INTERNAL_SECRET` (shared between agent and gateway for push auth)
