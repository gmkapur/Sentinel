# Architecture

## System Overview

```
┌─────────────────────────────────┐       ┌──────────────────────────────────────────┐
│  GATEWAY SERVICE (:3001)        │       │  AGENT SERVICE (:3002)                   │
│  Express + Socket.io            │◄─http─│  Express (lightweight router)            │
│                                 │       │                                          │
│  • Client-facing REST API       │       │  • Cron-scheduled data pollers           │
│  • WebSocket hub → frontend     │       │  • In-memory multi-source data cache     │
│  • Satellite position engine    │       │  • Risk scoring engine (fusion)          │
│  • Proxies agent intelligence   │       │  • Claude LLM reasoning layer            │
│  • TLE cache + SGP4 propagation │       │  • Pushes alerts → Gateway via HTTP      │
└────────────┬────────────────────┘       └──────────────┬───────────────────────────┘
             │ Socket.io                                 │ axios (cron-scheduled)
             ▼                                           ▼
        React Frontend                        NASA DONKI / NOAA SWPC /
        (react-globe.gl + satellite.js)       CelesTrak / NeoWs / Claude API
```

**Inter-service communication:** The agent POSTs fused risk state + LLM briefs to the gateway's internal endpoint (`POST /internal/agent-push`), authenticated by a shared `INTERNAL_SECRET` header. The gateway broadcasts to all connected frontends via Socket.io. The gateway can also pull from the agent on-demand (`GET :3002/status`, `GET :3002/brief`).

## Core Components

### Service 1 — Gateway (`:3001`)

The client-facing service. Owns the WebSocket, serves satellite positions, and relays agent intelligence.

- **Purpose**: Serve the frontend via REST + WebSocket, compute satellite positions, proxy agent data
- **Entrypoint**: `packages/gateway/src/index.ts`
- **Key files**:
  - `packages/gateway/src/routes.ts` — REST API routes
  - `packages/gateway/src/satellites.ts` — TLE cache + SGP4 propagation
  - `packages/gateway/src/socketHub.ts` — Socket.io event management
  - `packages/gateway/src/agentProxy.ts` — Proxy routes to agent service
- **Depends on**: CelesTrak (TLE data), Agent service (risk state + briefs)
- **Depended on by**: React Frontend

#### REST API

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/satellites` | GET | Current positions for all tracked satellites (SGP4-propagated from cached TLEs) |
| `/api/satellites/:noradId` | GET | Single satellite position + orbital metadata |
| `/api/status` | GET | Current global risk level, score, breakdown |
| `/api/alerts` | GET | Alert history (relayed from agent) |
| `/api/space-weather` | GET | Latest cached SWPC data |
| `/api/agent/brief` | GET | Latest LLM-generated mission brief (proxied from agent `:3002/brief`) |
| `/api/agent/brief` | POST | Force on-demand brief generation (proxied to agent `:3002/brief/generate`) |
| `/api/agent/health` | GET | Agent service health (proxied from agent `:3002/health`) |
| `/internal/agent-push` | POST | **Internal only.** Receives risk state + briefs from agent. Validates `x-internal-secret` header. Broadcasts via Socket.io. |

#### Socket.io Events (emitted to frontend)

| Event | Payload | Trigger |
|-------|---------|---------|
| `risk-update` | `{ score, level, breakdown, timestamp }` | Every agent evaluation cycle (~5 min) |
| `risk-alert` | `{ level, score, alerts[], brief, timestamp }` | Risk level threshold crossing |
| `satellite-positions` | `[{ id, name, lat, lng, alt, velocity }]` | Every 10s via `setInterval` |
| `space-weather` | `{ xray, kp, protonFlux, solarWind, bz }` | On new SWPC data from agent |

#### Satellite Position Engine

The gateway owns TLE caching and SGP4 propagation (not the agent) because position computation is latency-sensitive and tightly coupled to the frontend render loop. TLEs are fetched from CelesTrak every 2 hours by the gateway itself.

### Service 2 — Agent (`:3002`)

The autonomous reasoning engine. Runs independently, polls all external data sources on cron schedules, fuses signals, scores risk, calls Claude for plain-language briefs, and pushes results to the gateway.

- **Purpose**: Ingest space weather data, fuse signals into risk scores, generate LLM mission briefs, push state to gateway
- **Entrypoint**: `packages/agent/src/index.ts`
- **Key files**:
  - `packages/agent/src/router.ts` — 5-route lightweight API (health, status, brief, brief/generate, data/:source)
  - `packages/agent/src/pollers.ts` — Cron-scheduled data ingestion
  - `packages/agent/src/dataCache.ts` — node-cache wrapper with source-specific TTLs
  - `packages/agent/src/riskEngine.ts` — Multi-source fusion scoring engine
  - `packages/agent/src/llmBrief.ts` — Claude API integration for mission briefs
  - `packages/agent/src/push.ts` — HTTP push to gateway
- **Depends on**: External APIs (SWPC, DONKI, CelesTrak, NeoWs), Claude API
- **Depended on by**: Gateway service

#### Agent API (lightweight — 5 routes, no Socket.io)

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Uptime, last poll timestamps per source, cache hit rates |
| `/status` | GET | Current risk score, level, raw signal breakdown |
| `/brief` | GET | Latest LLM-generated mission brief |
| `/brief/generate` | POST | Force on-demand brief generation (bypasses cron schedule) |
| `/data/:source` | GET | Raw cached data by source (swpc-xray, swpc-kp, swpc-protons, swpc-wind, donki-flr, donki-cme, neows) |

### Risk Engine

- **Purpose**: Fuse multi-source data into a 0–100 risk score using base scores and compound synergy rules
- **Location**: `packages/agent/src/riskEngine.ts`

**Base scores (additive):**

| Signal | Condition | Points |
|--------|-----------|--------|
| Solar flare | X-class active | +40 |
| Solar flare | M5–M9 | +25 |
| Solar flare | M1–M4 | +15 |
| Geomagnetic storm | Kp ≥ 7 (G3+) | +30 |
| Geomagnetic storm | Kp ≥ 5 (G1+) | +15 |
| Radiation storm | Proton flux ≥ 100 pfu | +25 |
| Radiation storm | Proton flux ≥ 10 pfu (S1) | +15 |
| Solar wind | Speed > 700 km/s | +10 |
| IMF Bz | Bz < −10 nT (southward) | +10 |
| NEO close approach | PHA within 0.05 AU in next 7d | +5 |

**Compound rules (synergistic bonuses):**

| Combination | Bonus | Rationale |
|-------------|-------|-----------|
| M5+ flare AND Kp ≥ 5 | +15 | CME-driven storm confirmation |
| M5+ flare AND LEO satellite on sunlit side | +20 | Direct radiation exposure window |
| Kp ≥ 7 AND proton flux ≥ 100 pfu | +20 | Severe radiation + atmospheric drag |
| CME earth-directed AND speed > 1000 km/s | +15 | Fast CME → short reaction window |

**Score → level mapping:** `LOW` (0–19) · `MODERATE` (20–39) · `HIGH` (40–69) · `CRITICAL` (70–100)

### LLM Reasoning Layer

- **Purpose**: Generate structured go/no-go mission briefs using Claude Sonnet with full fused data context
- **Location**: `packages/agent/src/llmBrief.ts`
- **Model**: `claude-sonnet-4-20250514`

**Trigger conditions for LLM call:**
- Risk level changes (any direction)
- Risk score shifts ±15 points since last brief
- 30-minute heartbeat (baseline)
- On-demand via `POST /brief/generate`

**Output format:** Structured JSON with `recommendation` (GO/CAUTION/NO-GO), `summary`, `threats[]`, `maneuver_windows[]`, and `confidence` score.

### React Frontend

- **Purpose**: 3D globe visualization with real-time risk overlays, alert panels, and LLM brief display
- **Entrypoint**: `packages/frontend/src/App.tsx`
- **Key files**:
  - `packages/frontend/src/components/GlobeView.tsx` — react-globe.gl with satellite particles
  - `packages/frontend/src/components/RiskBanner.tsx` — top bar: GO / CAUTION / NO-GO + score
  - `packages/frontend/src/components/AlertPanel.tsx` — slide-out: active alerts + LLM brief
  - `packages/frontend/src/components/SpaceWeatherBar.tsx` — bottom HUD: Kp, X-ray, proton flux gauges
  - `packages/frontend/src/components/SatelliteInfoTooltip.tsx` — click-to-inspect satellite detail card
  - `packages/frontend/src/hooks/useSocket.ts` — Socket.io connection management
  - `packages/frontend/src/hooks/useSatellites.ts` — Satellite position state
  - `packages/frontend/src/types/index.ts` — Shared TypeScript interfaces
- **Depends on**: Gateway REST API, Gateway WebSocket

## Data Flow

### Agent Evaluation Cycle
1. node-cron triggers pollers on schedule (SWPC: 5 min, DONKI: 15 min, CelesTrak: 2 hours, NeoWs: daily)
2. Pollers fetch JSON from external APIs via axios
3. Responses are stored in node-cache with source-specific TTLs
4. `riskEngine.evaluate()` runs every 5 minutes, reads all cached data, computes composite score
5. If LLM trigger fires (level change, ±15 score delta, 30-min heartbeat), calls Claude for mission brief
6. Agent POSTs fused risk state + brief to gateway's `/internal/agent-push`
7. Gateway validates `x-internal-secret` header, broadcasts via Socket.io

### Gateway Satellite Loop
1. Gateway fetches OMM/JSON TLEs from CelesTrak every 2 hours
2. Every 10s, SGP4 propagates all cached TLEs to current positions
3. Socket.io emits `satellite-positions` to all connected frontends

### Frontend Rendering
1. On load, frontend connects Socket.io and fetches `/api/status` for initial state
2. Socket.io events (`risk-update`, `risk-alert`, `satellite-positions`, `space-weather`) drive reactive UI updates
3. react-globe.gl renders satellite particles at propagated positions
4. `RiskBanner` shows current GO/CAUTION/NO-GO recommendation
5. `AlertPanel` displays LLM-generated mission brief with threat details

## Data Storage
- **Primary storage**: In-memory via node-cache in both services (no database for MVP)
- **Cache TTLs**: SWPC = 300s, DONKI = 900s, TLEs = 7200s, NeoWs = 86400s
- **Persistence**: None — data is re-fetched on restart from live APIs
- **Alert history**: In-memory array in gateway (lost on restart)

## Project Structure

```
orbit-sentinel/
├── packages/
│   ├── gateway/                 # Service 1 — port 3001
│   │   ├── src/
│   │   │   ├── index.ts         # Express + Socket.io server
│   │   │   ├── routes.ts        # REST API routes
│   │   │   ├── satellites.ts    # TLE cache + SGP4 propagation
│   │   │   ├── socketHub.ts     # Socket.io event management
│   │   │   └── agentProxy.ts    # Proxy routes to agent service
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── agent/                   # Service 2 — port 3002
│   │   ├── src/
│   │   │   ├── index.ts         # Express server entry
│   │   │   ├── router.ts        # 5-route lightweight API
│   │   │   ├── pollers.ts       # Cron-scheduled data ingestion
│   │   │   ├── dataCache.ts     # node-cache wrapper with TTLs
│   │   │   ├── riskEngine.ts    # Fusion scoring engine
│   │   │   ├── llmBrief.ts      # Claude API integration
│   │   │   └── push.ts          # HTTP push to gateway
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                # React app
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/
│       │   │   ├── GlobeView.tsx
│       │   │   ├── RiskBanner.tsx
│       │   │   ├── AlertPanel.tsx
│       │   │   ├── SpaceWeatherBar.tsx
│       │   │   └── SatelliteInfoTooltip.tsx
│       │   ├── hooks/
│       │   │   ├── useSocket.ts
│       │   │   └── useSatellites.ts
│       │   └── types/
│       │       └── index.ts
│       ├── package.json
│       └── vite.config.ts
│
├── .env                         # Shared env vars
├── package.json                 # Workspace root (npm workspaces)
└── README.md
```

## External Dependencies

| Service | Purpose | Consumer | Failure Impact |
|---------|---------|----------|----------------|
| NOAA SWPC | Real-time space weather (X-ray, Kp, protons, solar wind) | Agent | Risk scoring degraded — serve stale cache |
| NASA DONKI | Space weather events (flares, CMEs, storms) | Agent | Event history unavailable — core scoring still works via SWPC |
| CelesTrak | Satellite orbital elements (OMM/JSON) | Gateway + Agent | Satellite positions stale — globe shows last known positions |
| NASA NeoWs | Near-Earth object tracking | Agent | NEO layer unavailable — non-critical for core risk scoring |
| NASA EONET | Natural event tracking (ground station risk) | Agent | Earth events layer unavailable — non-critical |
| Claude API | LLM reasoning for mission briefs | Agent | Briefs unavailable — risk scores still computed, no plain-language output |

## Environment Variables

```env
# Gateway
GATEWAY_PORT=3001
AGENT_URL=http://localhost:3002

# Agent
AGENT_PORT=3002
GATEWAY_URL=http://localhost:3001
NASA_API_KEY=your_key_here          # api.nasa.gov (free, instant)
ANTHROPIC_API_KEY=your_key_here     # Claude API key
INTERNAL_SECRET=shared_secret_here  # Inter-service auth

# Optional
CELESTRAK_POLL_INTERVAL=7200000     # 2 hours in ms
```

## Key Design Decisions

### Two Microservices over Monolith
- **Context**: The agent (data polling + risk scoring + LLM reasoning) is compute-heavy and independent from the latency-sensitive gateway
- **Decision**: Split into Gateway (:3001) and Agent (:3002) services communicating via HTTP
- **Rationale**: Agent can restart/fail without dropping WebSocket connections; separation of concerns; agent can scale independently
- **Trade-offs**: Slightly more complex deployment; need inter-service auth (`INTERNAL_SECRET`)

### Agent Push Model (agent → gateway)
- **Context**: Agent evaluates risk every 5 minutes, gateway needs to broadcast results immediately
- **Decision**: Agent POSTs to gateway's `/internal/agent-push` after each evaluation cycle
- **Rationale**: Simpler than shared message bus for 2-service MVP. Agent is fire-and-forget. Gateway doesn't need to poll.
- **Trade-offs**: If gateway is down, pushes are lost (acceptable for MVP — next cycle retries)

### Claude LLM for Mission Briefs
- **Context**: Threshold-based dashboards lack contextual reasoning about compound threats
- **Decision**: Use Claude Sonnet to generate structured go/no-go briefs from fused data
- **Rationale**: Transforms raw scores into actionable intelligence with threat explanations and maneuver recommendations
- **Trade-offs**: Adds API cost and latency; requires graceful degradation when API is unavailable

### In-Memory Cache over Database
- **Context**: MVP needs to store frequently-updated API data with TTLs
- **Decision**: Use node-cache (in-memory TTL cache) instead of Redis or a database
- **Rationale**: Zero infrastructure dependency, sub-millisecond reads, no setup time — data is ephemeral anyway
- **Trade-offs**: Data lost on restart, no persistence, no horizontal scaling

### JSON/OMM Format over Legacy TLE
- **Context**: TLE text format has a 5-digit NORAD catalog number limit exhausting ~July 2026
- **Decision**: Use JSON/OMM format from CelesTrak with satellite.js v7
- **Rationale**: Future-proof against catalog number exhaustion, easier to parse, no string manipulation
- **Trade-offs**: Slightly larger payload than compact TLE text

### Gateway Owns Satellite Propagation
- **Context**: SGP4 propagation needs to run every 10s for smooth globe animation
- **Decision**: Gateway fetches TLEs and runs satellite.js propagation locally, not through the agent
- **Rationale**: Position computation is latency-sensitive and tightly coupled to the frontend render loop; avoids unnecessary inter-service hops for high-frequency data
- **Trade-offs**: TLE fetching duplicated (agent fetches for risk context, gateway fetches for propagation)

### Globe.gl over CesiumJS
- **Context**: Need 3D satellite visualization within a 6-hour sprint
- **Decision**: Use react-globe.gl with satellite.js
- **Rationale**: Official satellite example exists, 1–2 hour integration time, ~200–300 kB gzipped vs CesiumJS's 3–5 MB
- **Trade-offs**: Less capable than CesiumJS for professional SSA (no CZML, no terrain, no time-dynamic trajectories)

## Scaling Considerations
- **Current capacity**: Two single-process Node.js services suitable for development and demos
- **Bottlenecks**: In-memory cache limits to single instance per service; satellite.js propagation is CPU-bound for large satellite counts
- **Horizontal scaling**: Would require shared cache (Redis), external session store, load balancer, and service discovery — out of scope for MVP
- **Agent scaling**: LLM calls are the primary latency bottleneck; could add request queuing or parallel brief generation for multiple satellite groups
