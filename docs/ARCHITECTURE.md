# Architecture

## System Overview

Orbit Sentinel uses a two-service microservice architecture with a React frontend. The **Agent** autonomously ingests external data, scores risk, and generates LLM briefs. The **Gateway** serves the frontend, propagates satellite positions, and broadcasts real-time updates via WebSocket.

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL DATA SOURCES                            │
│  NOAA SWPC  ·  NASA DONKI  ·  NASA NeoWs  ·  NASA EONET  ·  Claude    │
└─────────────────────────────┬────────────────────────────────────────────┘
                              │ axios (cron-scheduled)
                              ▼
┌──────────────────────────────────────────┐
│  AGENT SERVICE (:3002)                   │
│                                          │
│  ┌─────────────┐  ┌──────────────────┐   │
│  │  Pollers     │  │  Risk Engine     │   │
│  │  swpc.ts     │─▶│  riskEngine.ts   │   │
│  │  donki.ts    │  │  0-100 scoring   │   │
│  │  neows.ts    │  │  + compound      │   │
│  │  eonet.ts    │  │  synergy rules   │   │
│  └─────────────┘  └────────┬─────────┘   │
│         │                  │              │
│         ▼                  ▼              │
│  ┌─────────────┐  ┌──────────────────┐   │
│  │  Data Cache  │  │  LLM Brief       │   │
│  │  node-cache  │  │  llmBrief.ts     │   │
│  │  per-source  │  │  Claude Sonnet   │   │
│  │  TTLs        │  │  GO/CAUTION/     │   │
│  └─────────────┘  │  NO-GO            │   │
│                   └────────┬─────────┘   │
│                            │              │
│                     push.ts│              │
└────────────────────────────┼──────────────┘
                             │ POST /internal/agent-push
                             │ x-internal-secret header
                             ▼
┌─────────────────────────────────────────┐
│  GATEWAY SERVICE (:3001)                │
│                                         │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │  REST API    │  │  Agent State    │   │
│  │  routes.ts   │  │  agentState.ts  │   │
│  │  /api/*      │  │  risk + briefs  │   │
│  └─────────────┘  │  + alert history│   │
│                   └─────────────────┘   │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │  Satellite   │  │  Socket.io Hub  │   │
│  │  Engine      │  │  Real-time      │   │
│  │  satellites  │  │  broadcasts to  │   │
│  │  .ts (SGP4)  │  │  all clients    │   │
│  └─────────────┘  └────────┬────────┘   │
└────────────────────────────┼────────────┘
                             │ Socket.io
                             ▼
┌─────────────────────────────────────────┐
│  REACT FRONTEND                         │
│  react-globe.gl + satellite.js          │
│                                         │
│  GlobeView · RiskBanner · AlertPanel    │
│  SpaceWeatherBar · SatelliteInfoTooltip │
└─────────────────────────────────────────┘
```

### Inter-Service Communication

The agent POSTs fused risk state + LLM briefs to the gateway's internal endpoint (`POST /internal/agent-push`), authenticated by a shared `INTERNAL_SECRET` header. The gateway stores the payload, creates alert records on risk level changes, and broadcasts to all connected frontends via Socket.io. The gateway can also pull from the agent on-demand (`GET :3002/status`, `GET :3002/brief`).

---

## Core Components

### Shared Types — `packages/shared/types.ts`

Shared TypeScript interfaces used by both backend services. Defines all domain types: `RiskState`, `RiskLevel`, `RiskBreakdown`, `SpaceWeatherState`, `MissionBrief`, `DONKIFlare`, `DONKICME`, `NEOObject`, `SatPosition`, `AgentPushPayload`, `AlertRecord`, and more.

Both services import these types via relative path. The shared package has no runtime dependencies — it's types only.

### Service 1: Gateway (`:3001`)

The client-facing service. Owns the WebSocket, serves satellite positions, and relays agent intelligence.

| Aspect | Detail |
|--------|--------|
| **Purpose** | Serve frontend via REST + WebSocket, compute satellite positions, proxy agent data |
| **Entrypoint** | `packages/gateway/src/index.ts` |
| **Depends on** | CelesTrak (TLE data), Agent service (risk state + briefs) |
| **Depended on by** | React frontend |

**Key files:**
- `routes.ts` — REST API routes + internal agent-push endpoint
- `satellites.ts` — TLE cache + SGP4 propagation via satellite.js
- `agentState.ts` — In-memory store for latest agent push + alert history

#### REST API

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/satellites` | GET | Current positions for all tracked satellites (SGP4-propagated) |
| `/api/satellites/:noradId` | GET | Single satellite position + TLE lines |
| `/api/status` | GET | Full system state: risk, brief, space weather, satellite count |
| `/api/alerts` | GET | Alert history (created on risk level changes, max 100) |
| `/api/space-weather` | GET | Latest SWPC data from agent |
| `/api/agent/brief` | GET | Latest LLM-generated mission brief |
| `/api/agent/brief` | POST | Force on-demand brief generation (proxied to agent) |
| `/api/agent/health` | GET | Agent service health (proxied) |
| `/internal/agent-push` | POST | **Internal.** Receives state from agent. Requires `x-internal-secret`. |

#### Socket.io Events

| Event | Payload | Trigger |
|-------|---------|---------|
| `risk-update` | `{ score, level, breakdown, timestamp }` | Every agent evaluation (~5 min) |
| `risk-alert` | `{ level, score, brief, timestamp }` | Risk level threshold crossing |
| `satellite-positions` | `SatPosition[]` | Every 10s + on client connect |
| `space-weather` | `SpaceWeatherState` | On new SWPC data from agent |

#### Satellite Position Engine

The gateway owns TLE caching and SGP4 propagation (not the agent) because position computation is latency-sensitive and tightly coupled to the frontend render loop. TLEs are fetched from CelesTrak every 2 hours (`stations` and `active` groups) and propagated every 10 seconds using `satellite.twoline2satrec()`.

### Service 2: Agent (`:3002`)

The autonomous reasoning engine. Runs independently, polls external data sources on cron schedules, fuses signals, scores risk, calls Claude for mission briefs, and pushes results to the gateway.

| Aspect | Detail |
|--------|--------|
| **Purpose** | Ingest space weather data, fuse into risk scores, generate LLM briefs, push to gateway |
| **Entrypoint** | `packages/agent/src/index.ts` |
| **Depends on** | External APIs (SWPC, DONKI, NeoWs, EONET), Claude API (optional) |
| **Depended on by** | Gateway service |

**Key files:**
- `router.ts` — Lightweight API routes (health, status, brief, data, space-weather)
- `pollers/swpc.ts` — NOAA SWPC poller (X-ray, Kp, protons, solar wind, mag, alerts)
- `pollers/donki.ts` — NASA DONKI poller (flares, CMEs, geomagnetic storms)
- `pollers/neows.ts` — NASA NeoWs poller (near-Earth objects)
- `pollers/eonet.ts` — NASA EONET poller (natural events)
- `dataCache.ts` — node-cache wrapper with source-specific TTLs
- `riskEngine.ts` — Multi-source fusion scoring engine
- `llmBrief.ts` — Claude API integration for mission briefs
- `push.ts` — HTTP push to gateway

#### Agent API

| Route | Method | Purpose |
|-------|--------|---------|
| `/health` | GET | Uptime, last poll timestamps per source, cache stats |
| `/status` | GET | Current risk score, level, raw signal breakdown |
| `/brief` | GET | Latest LLM-generated mission brief |
| `/brief/generate` | POST | Force on-demand brief generation |
| `/data/:source` | GET | Raw cached data by source |
| `/space-weather` | GET | Processed space weather state |

---

## Risk Engine

**Location:** `packages/agent/src/riskEngine.ts`

The risk engine fuses multi-source data into a 0-100 score using base scores (additive) and compound synergy rules (bonus points for coincident events).

### Base Scores

| Signal | Condition | Points |
|--------|-----------|--------|
| Solar flare | X-class active | +40 |
| Solar flare | M5-M9 | +25 |
| Solar flare | M1-M4 | +15 |
| Solar flare | C-class | +5 |
| Geomagnetic storm | Kp >= 7 (G3+) | +30 |
| Geomagnetic storm | Kp >= 5 (G1+) | +15 |
| Geomagnetic storm | Kp >= 4 | +5 |
| Radiation storm | Proton flux >= 100 pfu | +25 |
| Radiation storm | Proton flux >= 10 pfu (S1) | +15 |
| Radiation storm | Proton flux >= 1 pfu | +5 |
| Solar wind | Speed > 700 km/s | +10 |
| Solar wind | Speed > 500 km/s | +5 |
| IMF Bz | Bz < -10 nT (southward) | +10 |
| IMF Bz | Bz < -5 nT | +5 |
| NEO close approach | PHA within 7 days | +5 |

### Compound Synergy Rules

| Combination | Bonus | Physical Rationale |
|-------------|-------|--------------------|
| M5+ flare AND Kp >= 5 | +15 | CME-driven storm confirmation |
| Kp >= 7 AND proton flux >= 100 pfu | +20 | Severe radiation + atmospheric drag |
| M5+ flare active | +10 | LEO sunlit radiation exposure window |

### Score-to-Level Mapping

`LOW` (0-19) · `MODERATE` (20-39) · `HIGH` (40-69) · `CRITICAL` (70-100)

---

## LLM Reasoning Layer

**Location:** `packages/agent/src/llmBrief.ts`

Generates structured GO/CAUTION/NO-GO mission briefs using Claude Sonnet with full fused data context.

| Aspect | Detail |
|--------|--------|
| **Model** | `claude-sonnet-4-20250514` |
| **API** | `@anthropic-ai/sdk` (Anthropic SDK) |
| **Output** | Structured JSON: `recommendation`, `summary`, `threats[]`, `maneuver_windows[]`, `confidence` |

### Trigger Conditions

| Condition | Description |
|-----------|-------------|
| Level change | Risk level transitions (any direction) |
| Score delta | Risk score shifts +/- 15 points since last brief |
| Heartbeat | 30-minute baseline generation |
| On-demand | `POST /brief/generate` endpoint |

### Fallback Behavior

Without `ANTHROPIC_API_KEY`, `shouldGenerateBrief()` returns `false` and the system uses deterministic fallback briefs derived from the risk score/level. The fallback briefs have `confidence: 0.5` and generic summaries.

---

## Data Flow

### Agent Evaluation Cycle

```
1. node-cron triggers pollers on schedule
   ├── SWPC: every 5 min (X-ray, Kp, protons, wind, mag)
   ├── DONKI: every 15 min (flares, CMEs, storms)
   ├── NeoWs: daily (near-Earth objects)
   └── EONET: hourly (natural events)

2. Pollers fetch JSON from external APIs via axios

3. Responses stored in node-cache with source-specific TTLs
   ├── SWPC: 300s
   ├── DONKI: 900s
   ├── NeoWs: 86400s
   └── EONET: 3600s

4. riskEngine.evaluate() runs every 5 min (offset 1 min after pollers)
   └── Reads all cached data, computes composite score

5. If LLM trigger fires → calls Claude for mission brief

6. Agent POSTs AgentPushPayload to gateway /internal/agent-push

7. Gateway validates x-internal-secret header
   ├── Stores state in agentState.ts
   ├── Creates alert record if level changed
   └── Broadcasts via Socket.io to all clients
```

### Gateway Satellite Loop

```
1. Gateway fetches 3LE TLEs from CelesTrak every 2 hours
   └── stations + active groups, deduplicated by NORAD ID

2. Every 10 seconds:
   ├── SGP4 propagates all cached TLEs to current lat/lng/alt
   └── Socket.io emits satellite-positions to all clients
```

### Frontend Rendering

```
1. On load: connect Socket.io + fetch /api/status for initial state
2. Socket.io events drive reactive UI updates
3. react-globe.gl renders satellite particles at propagated positions
4. RiskBanner shows GO/CAUTION/NO-GO with score
5. AlertPanel displays LLM brief with threat details
6. SpaceWeatherBar shows Kp, X-ray, proton flux gauges
```

---

## Data Storage

| Store | Technology | TTL | Persistence |
|-------|-----------|-----|-------------|
| Agent data cache | node-cache (in-memory) | 300s-86400s per source | None — repopulated from APIs on restart |
| Gateway TLE cache | node-cache (in-memory) | 7200s | None — refreshed from CelesTrak |
| Alert history | In-memory array (gateway) | Max 100 records | None — lost on restart |
| Agent state | In-memory object (gateway) | Overwritten each push | None |

---

## Project Structure

```
sentinel/
├── packages/
│   ├── shared/                   # Shared types
│   │   └── types.ts              # All TypeScript interfaces
│   │
│   ├── gateway/                  # Service 1 — port 3001
│   │   ├── src/
│   │   │   ├── index.ts          # Express + Socket.io + TLE refresh
│   │   │   ├── routes.ts         # REST API + internal agent-push
│   │   │   ├── satellites.ts     # TLE cache + SGP4 propagation
│   │   │   └── agentState.ts     # In-memory agent state + alerts
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── agent/                    # Service 2 — port 3002
│   │   ├── src/
│   │   │   ├── index.ts          # Express + cron scheduling
│   │   │   ├── router.ts         # API routes
│   │   │   ├── pollers/
│   │   │   │   ├── swpc.ts       # NOAA SWPC
│   │   │   │   ├── donki.ts      # NASA DONKI
│   │   │   │   ├── neows.ts      # NASA NeoWs
│   │   │   │   └── eonet.ts      # NASA EONET
│   │   │   ├── dataCache.ts      # node-cache wrapper
│   │   │   ├── riskEngine.ts     # Fusion scoring engine
│   │   │   ├── llmBrief.ts       # Claude API integration
│   │   │   └── push.ts           # HTTP push to gateway
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                 # React app (Vite)
│       ├── src/
│       │   ├── App.tsx
│       │   ├── components/       # GlobeView, RiskBanner, AlertPanel, etc.
│       │   ├── hooks/            # useSocket, useSatellites
│       │   └── types/            # Frontend TypeScript interfaces
│       ├── package.json
│       └── vite.config.ts
│
├── docs/                         # Project documentation
├── .env                          # Shared environment variables
├── .github/workflows/lint.yml    # CI: lint + format check
├── package.json                  # Workspace root
├── tsconfig.json                 # Root TypeScript config
├── eslint.config.mjs             # ESLint config
└── .prettierrc                   # Prettier config
```

---

## External Dependencies

| Service | Purpose | Consumer | Failure Impact | Degradation Strategy |
|---------|---------|----------|----------------|---------------------|
| NOAA SWPC | Real-time space weather (X-ray, Kp, protons, solar wind, Bz) | Agent | Risk scoring degraded | Serve stale cache |
| NASA DONKI | Space weather events (flares, CMEs, storms) | Agent | Event history unavailable | Core scoring works via SWPC |
| CelesTrak | Satellite orbital elements (3LE format) | Gateway | Satellite positions stale | Show last known positions |
| NASA NeoWs | Near-Earth object tracking | Agent | NEO layer unavailable | Non-critical for core scoring |
| NASA EONET | Natural event tracking | Agent | Earth events unavailable | Non-critical |
| Claude API | LLM reasoning for mission briefs | Agent | No LLM briefs | Deterministic fallback briefs |

---

## Key Design Decisions

### 1. Two Microservices over Monolith

| | |
|---|---|
| **Context** | Agent (polling + scoring + LLM) is compute-heavy and independent from the latency-sensitive gateway |
| **Decision** | Split into Gateway (:3001) and Agent (:3002) communicating via HTTP |
| **Rationale** | Agent can restart/fail without dropping WebSocket connections; separation of concerns; independent scaling |
| **Trade-off** | Slightly more complex deployment; requires inter-service auth |

### 2. Agent Push Model (Agent -> Gateway)

| | |
|---|---|
| **Context** | Agent evaluates risk every 5 minutes; gateway needs to broadcast immediately |
| **Decision** | Agent POSTs to gateway's `/internal/agent-push` after each evaluation |
| **Rationale** | Simpler than shared message bus for 2-service MVP. Fire-and-forget. Gateway doesn't poll. |
| **Trade-off** | If gateway is down, pushes are lost (next cycle retries) |

### 3. Claude LLM for Mission Briefs

| | |
|---|---|
| **Context** | Threshold-based dashboards lack contextual reasoning about compound threats |
| **Decision** | Use Claude Sonnet to generate structured GO/CAUTION/NO-GO briefs |
| **Rationale** | Transforms raw scores into actionable intelligence with threat explanations |
| **Trade-off** | API cost and latency; requires graceful fallback |

### 4. In-Memory Cache over Database

| | |
|---|---|
| **Context** | MVP needs frequently-updated API data with TTLs |
| **Decision** | node-cache (in-memory) instead of Redis or database |
| **Rationale** | Zero infrastructure dependency, sub-millisecond reads, data is ephemeral anyway |
| **Trade-off** | Data lost on restart, no persistence, no horizontal scaling |

### 5. Gateway Owns Satellite Propagation

| | |
|---|---|
| **Context** | SGP4 propagation runs every 10s for smooth globe animation |
| **Decision** | Gateway fetches TLEs and runs satellite.js locally |
| **Rationale** | Latency-sensitive, coupled to frontend render loop, avoids inter-service hops |
| **Trade-off** | TLE fetching separated from agent's polling |

### 6. Globe.gl over CesiumJS

| | |
|---|---|
| **Context** | Need 3D satellite visualization within a 6-hour sprint |
| **Decision** | react-globe.gl with satellite.js |
| **Rationale** | Official satellite example exists, 1-2 hour integration, ~200-300 kB vs CesiumJS's 3-5 MB |
| **Trade-off** | Less capable for professional SSA (no CZML, no terrain, no time-dynamic trajectories) |

---

## Scaling Considerations

### Current Capacity Estimates

| Resource | Limit | Bottleneck |
|----------|-------|-----------|
| WebSocket clients | ~500 concurrent | SGP4 propagation loop saturates event loop |
| Satellite count | ~2,000 TLEs | 10s propagation takes >8s on single core |
| Agent eval cycle | ~5s per cycle | LLM call adds 2-10s latency |
| Memory (agent) | ~200 MB | node-cache grows with DONKI history |
| Memory (gateway) | ~150 MB | TLE cache + alert records + Socket.io state |
| Alert history | 100 records | Hard-coded cap; oldest dropped |

### Prioritized Scaling Roadmap

| Priority | Change | Unblocks | Effort |
|----------|--------|----------|--------|
| 1 | **Redis shared cache** | Horizontal gateway scaling, Socket.io adapter | 4-8 hours |
| 2 | **Worker thread pool for SGP4** | Satellite count > 2,000 | 2-4 hours |
| 3 | **LLM request queue** (BullMQ) | Concurrent brief requests, rate limiting | 2-3 hours |
| 4 | **PostgreSQL persistence** | Alert history, risk time series, audit trail | 8-12 hours |
| 5 | **Service discovery + load balancer** | Multi-instance deployment | 1-2 days |

---

## Data Source Extensibility

### Plugin Interface (Post-MVP)

The agent's poller architecture supports extension without modifying the risk engine core:

```typescript
interface DataSourcePoller {
  sourceId: string;       // Cache key (e.g., "swpc-xray", "amateur-kp")
  schedule: string;       // Cron expression
  ttl: number;            // Cache TTL in seconds
  poll(): Promise<unknown>;
  extractSignals(data: unknown): RiskSignal[];
}

interface RiskSignal {
  category: 'solarFlare' | 'geomagneticStorm' | 'radiationStorm'
          | 'solarWind' | 'imfBz' | 'neo' | 'custom';
  points: number;         // 0-40 per signal
  reason: string;         // Human-readable
}
```

### Adding a New Data Source

1. Create `packages/agent/src/pollers/<source>.ts` implementing fetch + cache pattern
2. Register the cron job in `packages/agent/src/index.ts`
3. Add the source to `dataCache.ts` key whitelist
4. Emit `RiskSignal` objects mapping to existing score categories
5. For new categories, extend `RiskBreakdown` in `packages/shared/types.ts`

### Candidate Future Sources

| Source | Data | Value Add |
|--------|------|-----------|
| Space-Track (full catalog) | Conjunction data messages (CDMs) | Real collision risk |
| Amateur radio Kp network | Community magnetometer readings | Denser Kp coverage |
| ESA SSA | European space weather bulletins | Independent NOAA confirmation |
| GOES magnetometer (real-time) | Real-time geomagnetic field | Sub-minute storm detection |
| Satellite operator feeds | Anomaly reports, telemetry | Ground-truth validation |
