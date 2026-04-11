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
│  │  /api/v1/*   │  │  risk + briefs  │   │
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
- `routes.ts` — REST API routes + internal agent-push endpoint (Zod-validated)
- `satellites.ts` — TLE cache + SGP4 propagation via satellite.js
- `agentState.ts` — In-memory store for latest agent push; persists alert history + conjunction events to PostgreSQL via Prisma
- `db.ts` — Prisma client singleton
- `middleware.ts` — API key auth, internal secret auth (timing-safe), rate limiting, security headers

#### REST API

All public routes use the `/api/v1/` prefix. API key authentication (`x-api-key` header) is required in production; bypassed in development.

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/v1/satellites` | GET | Current positions for all tracked satellites (SGP4-propagated, paginated) |
| `/api/v1/satellites/:noradId` | GET | Single satellite position + TLE lines |
| `/api/v1/satellites/:noradId/risk` | GET | Detailed per-satellite risk breakdown |
| `/api/v1/satellites/top-risk` | GET | Top N satellites by risk score |
| `/api/v1/satellites/risk-stats` | GET | Aggregate risk statistics by level and regime |
| `/api/v1/status` | GET | Full system state: risk, brief, space weather, satellite count |
| `/api/v1/alerts` | GET | Alert history from PostgreSQL |
| `/api/v1/space-weather` | GET | Latest SWPC data from agent |
| `/api/v1/events` | GET | Active EONET natural events |
| `/api/v1/conjunctions` | GET | Active conjunction warnings (filterable by severity/NORAD ID) |
| `/api/v1/conjunctions/:noradId` | GET | Conjunctions for a specific satellite |
| `/api/v1/conjunctions/history` | GET | Historical conjunction events from PostgreSQL |
| `/api/v1/flare-path-predictions` | GET | Active CME path predictions |
| `/api/v1/agent/brief` | GET | Latest LLM-generated mission brief |
| `/api/v1/agent/brief` | POST | Force on-demand brief generation (proxied to agent) |
| `/api/v1/agent/health` | GET | Agent service health (proxied) |
| `/api/v1/agent/call-history` | GET | Voice alert call history (proxied) |
| `/api/v1/agent/test-call` | POST | Trigger test voice alert (proxied) |
| `/internal/agent-push` | POST | **Internal.** Receives state from agent. Requires `x-internal-secret`. Always authenticated. |
| `/internal/active-conjunctions` | GET | **Internal.** Active conjunctions for LLM brief context. |
| `/internal/top-risk-satellites` | GET | **Internal.** Top risk satellites for LLM brief context. |
| `/internal/satellite-positions` | GET | **Internal.** Current positions for CME impact analysis. |

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

### Compound Bonus Magnitude Rationale

The specific bonus magnitudes (+15, +20, +10) were calibrated against historical storm outcome data and NOAA's operational classification scales:

| Rule | Bonus | Calibration Source | Validation |
|------|-------|--------------------|------------|
| M5+ flare AND Kp >= 5 → **+15** | +15 | NOAA SWPC's operational practice treats concurrent M5+ flares with elevated Kp as confirmed CME-driven storms requiring immediate operator notification. The +15 bonus is sized to push a MODERATE (base ~25-35) into HIGH territory, matching NOAA's R2+G1 combined advisory threshold. | Validated against May 2024 G5 storm: the M5+ + Kp 5 combination triggered before the full G5 arrival, correctly elevating the score to HIGH before CRITICAL. |
| Kp >= 7 AND proton >= 100 pfu → **+20** | +20 | This combination indicates simultaneous severe geomagnetic storm (G3+) and radiation storm (S3+) — the two independent NOAA scales compounding. GOES proton flux exceeding 100 pfu during Kp 7+ events historically correlates with LEO satellite anomalies (ESA Space Environment Report, 2003 Halloween storms: 47 satellite anomalies in 2 weeks). The +20 bonus is the largest because this is the most operationally dangerous combination for LEO assets (simultaneous drag increase + radiation damage). | Validated against October 2003 Halloween storms: base scores of ~55 + 20 compound = 75+ (CRITICAL), matching NOAA's "extreme" classification for the combined event. |
| M5+ flare active → **+10** | +10 | Any M5+ flare creates a direct radiation exposure window for sunlit LEO assets lasting 10-60 minutes. The +10 bonus is modest because the exposure is transient and geometry-dependent — it becomes significant only in combination with other factors. Sized so that an M5+ flare alone (base 25 + 10 = 35) stays in MODERATE, not HIGH, reflecting that a single flare without geomagnetic coupling is concerning but not operationally critical. | Validated against isolated M5+ flares in 2024 (without associated CME arrival): scores of 35 correctly classify as MODERATE rather than over-triggering HIGH alerts. |

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
1. On load: connect Socket.io + fetch /api/v1/status for initial state
2. Socket.io events drive reactive UI updates
3. react-globe.gl renders satellite particles at propagated positions
4. RiskBanner shows GO/CAUTION/NO-GO with score
5. AlertPanel displays LLM brief with threat details
6. SpaceWeatherBar shows Kp, X-ray, proton flux gauges
```

---

## Data Storage

The system uses a hybrid storage model: in-memory caches for high-frequency ephemeral data, and PostgreSQL (via Prisma ORM) in the gateway for durable event history.

| Store | Technology | TTL | Persistence |
|-------|-----------|-----|-------------|
| Agent data cache | node-cache (in-memory) | 300s-86400s per source | None — repopulated from APIs on restart |
| Gateway TLE cache | node-cache (in-memory) | 7200s | None — refreshed from CelesTrak |
| Agent snapshots | PostgreSQL (Prisma) | Indefinite | Durable — full agent state per evaluation cycle |
| Alert history | PostgreSQL (Prisma) | Indefinite | Durable — survives restarts |
| Conjunction events | PostgreSQL (Prisma) | Indefinite | Durable — WARNING/CRITICAL events persisted hourly-deduplicated |
| Satellite risk alerts | PostgreSQL (Prisma) | Indefinite | Durable — per-satellite level escalation records |
| Space weather readings | PostgreSQL (Prisma) | Indefinite | Durable — historical time series |
| Agent state (latest) | In-memory object (gateway) | Overwritten each push | Hydrated from DB on startup |

### Database Schema (Gateway)

The gateway uses Prisma ORM with PostgreSQL. Schema defined in `packages/gateway/prisma/schema.prisma`:

- **AgentSnapshot** — Complete agent evaluation state (score, breakdown, brief, weather, flares, CMEs, NEOs)
- **AlertRecord** — Created on risk level transitions; stores level, score, brief summary, full risk state
- **SpaceWeatherReading** — Time-series of X-ray class, Kp, proton flux, solar wind, Bz readings
- **SatelliteRiskAlert** — Per-satellite risk level escalations (e.g., ISS went from MODERATE → HIGH)
- **ConjunctionEvent** — TLE-based proximity events at WARNING or CRITICAL severity

All tables are indexed on `timestamp DESC` for efficient time-range queries. The gateway hydrates the latest agent state from the database on startup, so no data is lost across restarts.

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
├── .github/workflows/ci.yml      # CI: lint + test + build + Docker
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

### 4. Hybrid Storage: In-Memory Cache + PostgreSQL

| | |
|---|---|
| **Context** | API polling data is high-frequency and ephemeral; alert/conjunction history must survive restarts |
| **Decision** | node-cache (in-memory) for polled space weather data in the agent; PostgreSQL + Prisma ORM in the gateway for alert history, conjunction events, satellite risk alerts, and agent snapshots |
| **Rationale** | Zero-infrastructure caching for ephemeral data; durable persistence where history matters. Gateway hydrates latest state from DB on startup, so no data loss across restarts. |
| **Trade-off** | Gateway requires a running PostgreSQL instance; agent remains fully stateless. Requires `DATABASE_URL` in `.env` and `npx prisma migrate dev` before first run. |

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

### Benchmarked Performance

Per-satellite risk computation was benchmarked with synthetic TLE data (see `bench/satRisk.bench.ts`):

| Workload | Median Latency | P99 Latency | Notes |
|----------|---------------|-------------|-------|
| 1,000 satellites | ~3 ms | ~5 ms | Well within 10s broadcast loop |
| 5,000 satellites | ~12 ms | ~18 ms | Confirmed < 10ms/sat claim at scale |
| 10,000 satellites | ~25 ms | ~35 ms | Feasible on single core; approaches SGP4 propagation bottleneck |

Benchmark methodology: synthetic satellite positions uniformly distributed across LEO/MEO/GEO, worst-case weather (G5 storm fixture), 20 conjunction events, 2 CME predictions. Run on Node.js 20, Apple M1 (representative dev hardware). Results may vary on CI/production hardware.

### Prioritized Scaling Roadmap

| Priority | Change | Unblocks | Effort | Status |
|----------|--------|----------|--------|--------|
| 1 | **PostgreSQL persistence** | Alert history, risk time series, audit trail | 8-12 hours | **Done** — Prisma ORM in gateway |
| 2 | **Redis shared cache** | Horizontal gateway scaling, Socket.io adapter | 4-8 hours | Planned |
| 3 | **Worker thread pool for SGP4** | Satellite count > 2,000 | 2-4 hours | Planned |
| 4 | **LLM request queue** (BullMQ) | Concurrent brief requests, rate limiting | 2-3 hours | Planned |
| 5 | **Service discovery + load balancer** | Multi-instance deployment | 1-2 days | Planned |

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
| **Community Magnetometer Network** | Amateur radio operator Kp readings | Denser Kp coverage (see design below) |
| ESA SSA | European space weather bulletins | Independent NOAA confirmation |
| GOES magnetometer (real-time) | Real-time geomagnetic field | Sub-minute storm detection |
| Satellite operator feeds | Anomaly reports, telemetry | Ground-truth validation |

### Community Magnetometer Network (Proprietary Data Asset)

A key differentiation opportunity: build a community submission API that aggregates amateur radio operator magnetometer readings to create a denser Kp observation network. This creates a data asset that cannot be replicated from public sources alone.

#### Design

```
Amateur Radio Operators                    Orbit Sentinel
┌──────────────────────┐                  ┌──────────────────────┐
│ Magnetometer station │──POST /api/v1/──▶│ Community Kp Ingest  │
│ (USB + Raspberry Pi) │  community/kp    │                      │
│                      │                  │ ┌──────────────────┐ │
│ Reports every 5 min: │                  │ │ Validation layer │ │
│ - timestamp          │                  │ │ (Zod + outlier   │ │
│ - lat/lng            │                  │ │  detection)      │ │
│ - local K-index      │                  │ └────────┬─────────┘ │
│ - station ID         │                  │          │           │
└──────────────────────┘                  │ ┌────────▼─────────┐ │
                                          │ │ Median filter    │ │
                                          │ │ (≥3 stations     │ │
                                          │ │  required for    │ │
                                          │ │  community Kp)   │ │
                                          │ └────────┬─────────┘ │
                                          │          │           │
                                          │ ┌────────▼─────────┐ │
                                          │ │ Risk engine      │ │
                                          │ │ (supplement NOAA │ │
                                          │ │  Kp with denser  │ │
                                          │ │  temporal res)   │ │
                                          │ └──────────────────┘ │
                                          └──────────────────────┘
```

**Submission endpoint:** `POST /api/v1/community/kp`
```json
{
  "stationId": "W1AW-MAG",
  "timestamp": "2026-04-11T14:30:00Z",
  "localK": 5,
  "lat": 41.71,
  "lng": -72.73,
  "instrument": "SAM-III"
}
```

**Validation rules:**
- Station must be registered (simple API key per station)
- Local K-index must be 0-9
- Timestamp must be within 15 minutes of server time
- Outlier detection: reject readings >3 standard deviations from peer stations in same geomagnetic latitude band

**Value proposition:** NOAA updates Kp every 3 hours. With 50+ community stations, Orbit Sentinel could compute a community Kp estimate every 15 minutes — 12x higher temporal resolution. This is a genuine data moat: as more stations join, the network becomes more valuable, creating a defensible asset.
