# Development Guide

## Prerequisites
- Node.js >= 20
- npm (comes with Node.js)
- A free NASA API key from https://api.nasa.gov (optional — `DEMO_KEY` works with lower rate limits)
- A Claude API key from https://console.anthropic.com (optional — deterministic fallback briefs without it)

## First-Time Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd sentinel

# 2. Install all dependencies (workspace root — installs agent, gateway, and frontend)
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and add your API keys:
#   NASA_API_KEY=your-key-here       (free at api.nasa.gov)
#   ANTHROPIC_API_KEY=sk-ant-...     (optional, for LLM briefs)

# 4. Start both services + frontend (in separate terminals)
cd packages/agent && npm run dev     # Terminal 1: Agent on :3002
cd packages/gateway && npm run dev   # Terminal 2: Gateway on :3001
cd packages/frontend && npm run dev  # Terminal 3: Frontend on :5173
```

No database setup required — all data is cached in-memory and fetched from live APIs.

## Common Development Commands

```bash
# Start agent service (data pollers + risk engine + LLM, port 3002)
cd packages/agent && npm run dev

# Start gateway service (REST API + Socket.io + satellites, port 3001)
cd packages/gateway && npm run dev

# Start frontend (Vite dev server, port 5173)
cd packages/frontend && npm run dev

# Lint check (no auto-fix)
npm run lint

# Lint with auto-fix
npm run lint:fix

# Format check
npm run format:check

# Format code
npm run format

# Build agent for production
cd packages/agent && npm run build

# Build gateway for production
cd packages/gateway && npm run build

# Build frontend for production
cd packages/frontend && npm run build
```

## Project Structure

```
sentinel/
├── packages/
│   ├── shared/                    # Shared TypeScript types
│   │   └── types.ts               # All domain interfaces
│   │
│   ├── agent/                     # Service 2 — port 3002
│   │   ├── src/
│   │   │   ├── index.ts           # Express server + cron scheduling + initial fetch
│   │   │   ├── router.ts          # Lightweight API routes
│   │   │   ├── pollers/
│   │   │   │   ├── swpc.ts        # NOAA SWPC (X-ray, Kp, protons, wind, mag, alerts)
│   │   │   │   ├── donki.ts       # NASA DONKI (flares, CMEs, geomagnetic storms)
│   │   │   │   ├── neows.ts       # NASA NeoWs (near-Earth objects)
│   │   │   │   └── eonet.ts       # NASA EONET (natural events)
│   │   │   ├── dataCache.ts       # node-cache wrapper with source-specific TTLs
│   │   │   ├── riskEngine.ts      # Fusion scoring engine (0–100)
│   │   │   ├── llmBrief.ts        # Claude API for mission briefs
│   │   │   └── push.ts            # HTTP push to gateway
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── gateway/                   # Service 1 — port 3001
│   │   ├── src/
│   │   │   ├── index.ts           # Express + Socket.io server
│   │   │   ├── routes.ts          # REST API + internal agent-push endpoint
│   │   │   ├── satellites.ts      # TLE cache + SGP4 propagation
│   │   │   └── agentState.ts      # In-memory agent state + alert history
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   └── frontend/                  # React app (Vite)
│       ├── src/
│       │   ├── App.tsx            # Root component
│       │   ├── components/
│       │   │   ├── GlobeView.tsx   # react-globe.gl 3D visualization
│       │   │   ├── RiskBanner.tsx  # GO/CAUTION/NO-GO banner
│       │   │   ├── AlertPanel.tsx  # Alert history + LLM brief
│       │   │   ├── SpaceWeatherBar.tsx  # Bottom HUD gauges
│       │   │   └── SatelliteInfoTooltip.tsx  # Satellite detail card
│       │   ├── hooks/
│       │   │   ├── useSocket.ts    # Socket.io connection + reactive state
│       │   │   └── useSatellites.ts # Satellite position state
│       │   └── types/
│       │       └── index.ts        # Frontend TypeScript interfaces
│       ├── package.json
│       └── vite.config.ts
│
├── docs/                          # Project documentation
├── .env                           # Shared env vars (not committed)
├── .github/workflows/lint.yml     # CI: lint + format check
├── package.json                   # Workspace root
├── tsconfig.json                  # Root TypeScript config
├── eslint.config.mjs              # ESLint config
└── .prettierrc                    # Prettier config
```

## Workflow

### Branch Strategy
- **Main branch**: `main` — always deployable
- **Feature branches**: `feature/short-description`
- **Bug fix branches**: `fix/short-description`
- **PR required**: Recommended
- **Review required**: Not enforced for MVP

### Before Submitting a PR
```bash
npm run lint && npm run format:check
```

### Commit Message Format
Conventional Commits — `type(scope): description`

Examples:
```
feat(agent/pollers): add SWPC X-ray flux poller
feat(gateway/satellites): fetch and propagate TLEs from CelesTrak
feat(frontend/globe): render satellite positions on 3D globe
fix(agent/risk-engine): correct compound scoring for concurrent flare and storm
docs(api): document gateway and agent endpoints
```

## Debugging

### Common Issues

#### Agent fails to push to gateway
The agent pushes to `GATEWAY_URL/internal/agent-push`. If the gateway isn't running, you'll see `[Push] Gateway push failed` logs. Start the gateway first, or accept that pushes will retry on the next evaluation cycle.

#### CORS errors in browser console
CelesTrak and other external APIs block browser requests. All external API calls must go through the backend pollers in the agent service. If you see CORS errors, you're likely calling an external API directly from the frontend.

#### NASA API returning 403 or rate limit errors
The `DEMO_KEY` only allows 30 requests/hour. Register a free key at api.nasa.gov for 1,000 requests/hour. Set it in `.env` as `NASA_API_KEY`.

#### No LLM briefs generated
Without `ANTHROPIC_API_KEY` in `.env`, the agent uses deterministic fallback briefs. Set the key to enable Claude-generated mission briefs.

#### Globe not rendering / black screen
Ensure `three` is installed as a peer dependency of react-globe.gl: `npm install three`.

#### Socket.io not connecting
Check that the gateway is running on the expected port (default 3001) and that `VITE_GATEWAY_URL` in the frontend matches.

### Debug Tools
- Backend: Check console logs — all pollers, risk engine, and push operations log their status
- Frontend: React DevTools + browser Network tab to inspect Socket.io frames
- Agent API: `curl http://localhost:3002/health` for uptime and poll timestamps
- Agent data: `curl http://localhost:3002/data/swpc-xray` for raw cached data
- Gateway API: `curl http://localhost:3001/api/status` for full system state
- Gateway satellites: `curl http://localhost:3001/api/satellites` for satellite positions

## IDE Setup
- **Recommended IDE**: VSCode
- **Recommended extensions**: ESLint, Prettier, ES7+ React snippets
- **Settings**: Format on save enabled
