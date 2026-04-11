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

## Secrets Management
- **Tool**: `.env` file (local development), platform env vars (production)
- **Never committed**: `.env` files, API keys
- **Required secrets**: `NASA_API_KEY` (free, instant registration at api.nasa.gov)
- **Optional secrets**: `ANTHROPIC_API_KEY` (Claude API for LLM briefs)
- **Internal secret**: `INTERNAL_SECRET` (shared between agent and gateway for push auth)
