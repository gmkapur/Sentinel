# Architecture

## System Overview

```
┌─────────────────────────────────┐       ┌──────────────────────────────────────────┐
│  GATEWAY SERVICE (:3001)        │       │  AGENT SERVICE (:3002)                   │
│  Express + Socket.io            │◄─http─│  Express (lightweight router)            │
│                                 │       │                                          │
│  • Client-facing REST API       │       │  • Cron-scheduled data pollers           │
│  • WebSocket hub → frontend     │       │    (SWPC, DONKI, NeoWs, EONET)          │
│  • Satellite position engine    │       │  • In-memory multi-source data cache     │
│  • Proxies agent intelligence   │       │  • Risk scoring engine (fusion)          │
│  • TLE cache + SGP4 propagation │       │  • Claude LLM reasoning layer            │
└────────────┬────────────────────┘       │  • Pushes state → Gateway via HTTP      │
             │ Socket.io                  └──────────────┬───────────────────────────┘
             ▼                                           │ axios (cron-scheduled)
        React Frontend                                   ▼
        (react-globe.gl + satellite.js)       NASA DONKI / NOAA SWPC /
                                              NeoWs / EONET / Claude API
```

**Inter-service communication:** The agent POSTs fused risk state + LLM briefs to the gateway's internal endpoint (`POST /internal/agent-push`), authenticated by a shared `INTERNAL_SECRET` header. The gateway broadcasts to all connected frontends via Socket.io. The gateway can also pull from the agent on-demand (`GET :3002/status`, `GET :3002/brief`).

## Core Components

### Shared Types — `packages/shared/types.ts`

Shared TypeScript interfaces used by both backend services. Defines all domain types: `RiskState`, `RiskLevel`, `RiskBreakdown`, `SpaceWeatherState`, `MissionBrief`, `DONKIFlare`, `DONKICME`, `NEOObject`, `SatPosition`, `AgentPushPayload`, `AlertRecord`, and more.

### Service 1 — Gateway (`:3001`)

The client-facing service. Owns the WebSocket, serves satellite positions, and relays agent intelligence.

- **Purpose**: Serve the frontend via REST + WebSocket, compute satellite positions, proxy agent data
- **Entrypoint**: `packages/gateway/src/index.ts`
- **Key files**:
  - `packages/gateway/src/routes.ts` — REST API routes + internal agent-push endpoint
  - `packages/gateway/src/satellites.ts` — TLE cache + SGP4 propagation via satellite.js
  - `packages/gateway/src/agentState.ts` — In-memory store for latest agent push + alert history
- **Depends on**: CelesTrak (TLE data), Agent service (risk state + briefs)
- **Depended on by**: React Frontend

#### REST API

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/satellites` | GET | Current positions for all tracked satellites (SGP4-propagated from cached TLEs) |
| `/api/satellites/:noradId` | GET | Single satellite position + TLE lines |
| `/api/status` | GET | Current global risk level, score, breakdown, brief, space weather, satellite count |
| `/api/alerts` | GET | Alert history (stored on risk level changes) |
| `/api/space-weather` | GET | Latest cached SWPC data from agent |
| `/api/agent/brief` | GET | Latest LLM-generated mission brief (local cache or proxied from agent) |
| `/api/agent/brief` | POST | Force on-demand brief generation (proxied to agent `:3002/brief/generate`) |
| `/api/agent/health` | GET | Agent service health (proxied from agent `:3002/health`) |
| `/internal/agent-push` | POST | **Internal only.** Receives risk state + briefs from agent. Validates `x-internal-secret` header. Triggers Socket.io broadcast. |

#### Socket.io Events (emitted to frontend)

| Event | Payload | Trigger |
|-------|---------|---------|
| `risk-update` | `{ score, level, breakdown, timestamp }` | Every agent evaluation cycle (~5 min) |
| `risk-alert` | `{ level, score, brief, timestamp }` | Risk level threshold crossing |
| `satellite-positions` | `[{ id, name, lat, lng, alt }]` | Every 10s via `setInterval` + on client connect |
| `space-weather` | `{ xray, kp, protonFlux, solarWind, bz }` | On new SWPC data from agent |

#### Satellite Position Engine

The gateway owns TLE caching and SGP4 propagation (not the agent) because position computation is latency-sensitive and tightly coupled to the frontend render loop. TLEs are fetched from CelesTrak every 2 hours by the gateway itself using 3LE format and propagated with `satellite.twoline2satrec()`.

### Service 2 — Agent (`:3002`)

The autonomous reasoning engine. Runs independently, polls all external data sources on cron schedules, fuses signals, scores risk, calls Claude for plain-language briefs, and pushes results to the gateway.

- **Purpose**: Ingest space weather data, fuse signals into risk scores, generate LLM mission briefs, push state to gateway
- **Entrypoint**: `packages/agent/src/index.ts`
- **Key files**:
  - `packages/agent/src/router.ts` — Lightweight API routes (health, status, brief, data/:source, space-weather)
  - `packages/agent/src/pollers/swpc.ts` — SWPC poller (X-ray, Kp, protons, solar wind, mag, alerts)
  - `packages/agent/src/pollers/donki.ts` — DONKI poller (flares, CMEs, geomagnetic storms)
  - `packages/agent/src/pollers/neows.ts` — NeoWs NEO tracking poller
  - `packages/agent/src/pollers/eonet.ts` — EONET natural events poller
  - `packages/agent/src/dataCache.ts` — node-cache wrapper with source-specific TTLs
  - `packages/agent/src/riskEngine.ts` — Multi-source fusion scoring engine
  - `packages/agent/src/llmBrief.ts` — Claude API integration for mission briefs
  - `packages/agent/src/push.ts` — HTTP push to gateway
- **Depends on**: External APIs (SWPC, DONKI, NeoWs, EONET), Claude API (optional)
- **Depended on by**: Gateway service

#### Agent API

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Uptime, last poll timestamps per source, cache stats |
| `/status` | GET | Current risk score, level, raw signal breakdown |
| `/brief` | GET | Latest LLM-generated mission brief |
| `/brief/generate` | POST | Force on-demand brief generation (bypasses cron schedule) |
| `/data/:source` | GET | Raw cached data by source (swpc-xray, swpc-kp, swpc-protons, swpc-wind, swpc-mag, donki-flares, donki-cme, neows, eonet) |
| `/space-weather` | GET | Processed space weather state (X-ray class, Kp value, proton flux, wind speed, Bz) |

### Risk Engine

- **Purpose**: Fuse multi-source data into a 0–100 risk score using base scores and compound synergy rules
- **Location**: `packages/agent/src/riskEngine.ts`

**Base scores (additive):**

| Signal | Condition | Points |
|--------|-----------|--------|
| Solar flare | X-class active | +40 |
| Solar flare | M5–M9 | +25 |
| Solar flare | M1–M4 | +15 |
| Solar flare | C-class | +5 |
| Geomagnetic storm | Kp ≥ 7 (G3+) | +30 |
| Geomagnetic storm | Kp ≥ 5 (G1+) | +15 |
| Geomagnetic storm | Kp ≥ 4 | +5 |
| Radiation storm | Proton flux ≥ 100 pfu | +25 |
| Radiation storm | Proton flux ≥ 10 pfu (S1) | +15 |
| Radiation storm | Proton flux ≥ 1 pfu | +5 |
| Solar wind | Speed > 700 km/s | +10 |
| Solar wind | Speed > 500 km/s | +5 |
| IMF Bz | Bz < −10 nT (southward) | +10 |
| IMF Bz | Bz < −5 nT | +5 |
| NEO close approach | PHA within next 7d | +5 |

**Compound rules (synergistic bonuses):**

| Combination | Bonus | Rationale |
|-------------|-------|-----------|
| M5+ flare AND Kp ≥ 5 | +15 | CME-driven storm confirmation |
| Kp ≥ 7 AND proton flux ≥ 100 pfu | +20 | Severe radiation + atmospheric drag |
| M5+ flare active | +10 | LEO sunlit radiation exposure window |

**Score → level mapping:** `LOW` (0–19) · `MODERATE` (20–39) · `HIGH` (40–69) · `CRITICAL` (70–100)

### LLM Reasoning Layer

- **Purpose**: Generate structured go/no-go mission briefs using Claude Sonnet with full fused data context
- **Location**: `packages/agent/src/llmBrief.ts`
- **Model**: `claude-sonnet-4-20250514`
- **API**: Direct HTTP to `https://api.anthropic.com/v1/messages` via axios

**Trigger conditions for LLM call:**
- Risk level changes (any direction)
- Risk score shifts ±15 points since last brief
- 30-minute heartbeat (baseline)
- On-demand via `POST /brief/generate`

**Fallback behavior:** Without `ANTHROPIC_API_KEY` set, `shouldGenerateBrief()` returns `false` and the system uses deterministic fallback briefs derived from the risk score/level.

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
  - `packages/frontend/src/hooks/useSocket.ts` — Socket.io connection management + reactive state
  - `packages/frontend/src/hooks/useSatellites.ts` — Satellite position state
  - `packages/frontend/src/types/index.ts` — Frontend TypeScript interfaces (synced from shared)
- **Depends on**: Gateway REST API, Gateway WebSocket

## Data Flow

### Agent Evaluation Cycle
1. node-cron triggers pollers on schedule (SWPC: 5 min, DONKI: 15 min, NeoWs: daily, EONET: hourly)
2. Pollers fetch JSON from external APIs via axios
3. Responses are stored in node-cache with source-specific TTLs (SWPC: 300s, DONKI: 900s, NeoWs: 86400s, EONET: 3600s)
4. `riskEngine.evaluate()` runs every 5 minutes (offset by 1 min to let pollers finish), reads all cached data, computes composite score
5. If LLM trigger fires (level change, ±15 score delta, 30-min heartbeat), calls Claude for mission brief
6. Agent POSTs `AgentPushPayload` (risk state, brief, space weather, flares, CMEs, NEOs) to gateway's `/internal/agent-push`
7. Gateway validates `x-internal-secret` header, stores state in `agentState.ts`, broadcasts via Socket.io

### Gateway Satellite Loop
1. Gateway fetches 3LE TLEs from CelesTrak every 2 hours (`stations` and `active` groups)
2. TLEs are deduplicated by NORAD ID across groups
3. Every 10s, SGP4 propagates all cached TLEs to current lat/lng/alt positions
4. Socket.io emits `satellite-positions` to all connected frontends

### Frontend Rendering
1. On load, frontend connects Socket.io and fetches `/api/status` for initial state
2. Socket.io events (`risk-update`, `risk-alert`, `satellite-positions`, `space-weather`) drive reactive UI updates
3. react-globe.gl renders satellite particles at propagated positions
4. `RiskBanner` shows current GO/CAUTION/NO-GO recommendation with risk score
5. `AlertPanel` displays LLM-generated mission brief with threat details

## Data Storage
- **Primary storage**: In-memory via node-cache in both services (no database for MVP)
- **Cache TTLs**: SWPC = 300s, DONKI = 900s, TLEs = 7200s, NeoWs = 86400s, EONET = 3600s
- **Persistence**: None — data is re-fetched on restart from live APIs
- **Alert history**: In-memory array in gateway (max 100 records, lost on restart)

## Project Structure

```
sentinel/
├── packages/
│   ├── shared/                   # Shared types
│   │   └── types.ts              # All TypeScript interfaces
│   │
│   ├── gateway/                  # Service 1 — port 3001
│   │   ├── src/
│   │   │   ├── index.ts          # Express + Socket.io server + TLE refresh
│   │   │   ├── routes.ts         # REST API routes + internal agent-push
│   │   │   ├── satellites.ts     # TLE cache + SGP4 propagation
│   │   │   └── agentState.ts     # In-memory agent state + alert history
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── agent/                    # Service 2 — port 3002
│   │   ├── src/
│   │   │   ├── index.ts          # Express server + cron scheduling + initial fetch
│   │   │   ├── router.ts         # Lightweight API routes
│   │   │   ├── pollers/
│   │   │   │   ├── swpc.ts       # NOAA SWPC (X-ray, Kp, protons, solar wind, mag)
│   │   │   │   ├── donki.ts      # NASA DONKI (flares, CMEs, geomagnetic storms)
│   │   │   │   ├── neows.ts      # NASA NeoWs (near-Earth objects)
│   │   │   │   └── eonet.ts      # NASA EONET (natural events)
│   │   │   ├── dataCache.ts      # node-cache wrapper with source-specific TTLs
│   │   │   ├── riskEngine.ts     # Fusion scoring engine
│   │   │   ├── llmBrief.ts       # Claude API integration
│   │   │   └── push.ts           # HTTP push to gateway
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                 # React app (Vite)
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
├── docs/                         # Project documentation
├── .env                          # Shared environment variables
├── .github/workflows/lint.yml    # CI: lint + format check
├── package.json                  # Workspace root (npm workspaces)
├── tsconfig.json                 # Root TypeScript config
├── eslint.config.mjs             # ESLint config
└── .prettierrc                   # Prettier config
```

## External Dependencies

| Service | Purpose | Consumer | Failure Impact |
|---------|---------|----------|----------------|
| NOAA SWPC | Real-time space weather (X-ray, Kp, protons, solar wind, Bz) | Agent | Risk scoring degraded — serve stale cache |
| NASA DONKI | Space weather events (flares, CMEs, geomagnetic storms) | Agent | Event history unavailable — core scoring still works via SWPC |
| CelesTrak | Satellite orbital elements (3LE format) | Gateway | Satellite positions stale — globe shows last known positions |
| NASA NeoWs | Near-Earth object tracking | Agent | NEO layer unavailable — non-critical for core risk scoring |
| NASA EONET | Natural event tracking | Agent | Earth events layer unavailable — non-critical |
| Claude API | LLM reasoning for mission briefs | Agent | Briefs use deterministic fallback — risk scores still computed |

## Environment Variables

```env
# Gateway
GATEWAY_PORT=3001
AGENT_URL=http://localhost:3002

# Agent
AGENT_PORT=3002
GATEWAY_URL=http://localhost:3001
NASA_API_KEY=DEMO_KEY              # api.nasa.gov (free, instant)
ANTHROPIC_API_KEY=                 # Claude API key (optional — fallback briefs without it)
INTERNAL_SECRET=shared_secret_here # Inter-service auth header
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
- **Trade-offs**: Adds API cost and latency; requires graceful degradation when API is unavailable or key not set

### In-Memory Cache over Database
- **Context**: MVP needs to store frequently-updated API data with TTLs
- **Decision**: Use node-cache (in-memory TTL cache) instead of Redis or a database
- **Rationale**: Zero infrastructure dependency, sub-millisecond reads, no setup time — data is ephemeral anyway
- **Trade-offs**: Data lost on restart, no persistence, no horizontal scaling

### Gateway Owns Satellite Propagation
- **Context**: SGP4 propagation needs to run every 10s for smooth globe animation
- **Decision**: Gateway fetches TLEs and runs satellite.js propagation locally, not through the agent
- **Rationale**: Position computation is latency-sensitive and tightly coupled to the frontend render loop; avoids unnecessary inter-service hops for high-frequency data
- **Trade-offs**: TLE fetching is separate from agent's data polling

### Globe.gl over CesiumJS
- **Context**: Need 3D satellite visualization within a 6-hour sprint
- **Decision**: Use react-globe.gl with satellite.js
- **Rationale**: Official satellite example exists, 1–2 hour integration time, ~200–300 kB gzipped vs CesiumJS's 3–5 MB
- **Trade-offs**: Less capable than CesiumJS for professional SSA (no CZML, no terrain, no time-dynamic trajectories)

## Scaling Considerations

### Current Capacity Estimates

| Resource | Limit | Bottleneck Trigger |
|----------|-------|-------------------|
| WebSocket clients | ~500 concurrent | SGP4 propagation loop (10s interval × 500+ satellites) saturates single Node.js event loop |
| Satellite count | ~2,000 TLEs | SGP4 propagation at 10s interval takes >8s on single core beyond this count |
| Agent evaluation cycle | ~5s per cycle | Acceptable for 5-min intervals; LLM call adds 2–10s latency |
| Memory (agent) | ~200 MB | node-cache with all sources cached; grows linearly with DONKI history window |
| Memory (gateway) | ~150 MB | TLE cache + 100 alert records + Socket.io connection state |
| Alert history | 100 records | Hard-coded cap; oldest dropped on overflow |

### Prioritized Scaling Roadmap

1. **Redis shared cache** (first bottleneck: horizontal gateway scaling)
   - Enables multiple gateway instances behind a load balancer
   - Socket.io adapter for Redis pub/sub broadcasts
   - Estimated effort: 4–8 hours

2. **Worker thread pool for SGP4** (second bottleneck: satellite count > 2,000)
   - Move satellite.js propagation to worker threads
   - Partition satellite list across workers
   - Estimated effort: 2–4 hours

3. **LLM request queue** (third bottleneck: concurrent brief requests)
   - BullMQ queue for Claude API calls with rate limiting
   - Prevents concurrent LLM calls from exceeding API rate limits
   - Estimated effort: 2–3 hours

4. **Database persistence** (fourth: alert history and audit trail)
   - PostgreSQL for alert history, risk score time series
   - Enables historical analysis and replay
   - Estimated effort: 8–12 hours

5. **Service discovery + load balancer** (fifth: multi-instance deployment)
   - Kubernetes or Docker Compose with Traefik/nginx
   - Health check-based routing
   - Estimated effort: 1–2 days

## Data Source Extensibility

### Plugin Interface (Post-MVP Design)

The agent's poller architecture is designed to be extended with new data sources without modifying the risk engine core. Each poller follows a consistent pattern:

```typescript
// Conceptual interface for new data source pollers
interface DataSourcePoller {
  /** Unique identifier for cache keys (e.g., "swpc-xray", "amateur-kp") */
  sourceId: string;

  /** Cron expression for polling schedule */
  schedule: string;

  /** Cache TTL in seconds */
  ttl: number;

  /** Fetch data from external source */
  poll(): Promise<unknown>;

  /** Extract risk-relevant signals from cached data */
  extractSignals(data: unknown): RiskSignal[];
}

interface RiskSignal {
  /** Which base score category this contributes to */
  category: 'solarFlare' | 'geomagneticStorm' | 'radiationStorm' | 'solarWind' | 'imfBz' | 'neo' | 'custom';

  /** Points to add (0–40 range per signal) */
  points: number;

  /** Human-readable reason */
  reason: string;
}
```

### Adding a New Data Source

To add a new poller without modifying `riskEngine.ts`:

1. Create `packages/agent/src/pollers/<source>.ts` implementing the fetch + cache pattern
2. Register the cron job in `packages/agent/src/index.ts`
3. Add the source to the `dataCache.ts` key whitelist
4. Emit signals via the `RiskSignal` interface that map to existing score categories
5. For new score categories, extend `RiskBreakdown` in `packages/shared/types.ts`

### Candidate Future Data Sources

| Source | Data | Value Add |
|--------|------|-----------|
| Space-Track (full catalog) | Conjunction data messages (CDMs) | Real collision risk, not just SOCRATES |
| Amateur radio Kp network | Community magnetometer readings | Denser Kp coverage, faster detection |
| ESA SSA | European space weather bulletins | Independent confirmation of NOAA data |
| GOES magnetometer (real-time) | Real-time geomagnetic field | Sub-minute storm onset detection |
| Satellite operator feeds | Anomaly reports, telemetry | Ground-truth validation of risk model |
