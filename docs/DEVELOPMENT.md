# Development Guide

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Node.js | >= 20 | Required for native fetch and stable ESM |
| npm | Included with Node.js | Used for workspace management |
| NASA API key | Free | Register at https://api.nasa.gov (instant, no approval) |
| Claude API key | Optional | Get from https://console.anthropic.com (enables LLM briefs) |

---

## First-Time Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd sentinel

# 2. Install all dependencies (workspace root)
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env:
#   NASA_API_KEY=your-key-here       (free at api.nasa.gov)
#   ANTHROPIC_API_KEY=sk-ant-...     (optional — for LLM briefs)
#   INTERNAL_SECRET=any-shared-key   (must match between services)

# 4. Start all three services (separate terminals)
cd packages/agent && npm run dev     # Terminal 1: Agent on :3002
cd packages/gateway && npm run dev   # Terminal 2: Gateway on :3001
cd packages/frontend && npm run dev  # Terminal 3: Frontend on :5173
```

No database setup required — all data is cached in-memory and fetched from live APIs on startup.

---

## Common Commands

### Running Services

```bash
# Agent service (data pollers + risk engine + LLM briefs)
cd packages/agent && npm run dev          # Dev mode with watch (port 3002)

# Gateway service (REST API + Socket.io + satellite propagation)
cd packages/gateway && npm run dev        # Dev mode with watch (port 3001)

# Frontend (Vite dev server)
cd packages/frontend && npm run dev       # Dev mode with HMR (port 5173)
```

### Testing

```bash
npm test                                  # Run all 156 tests (vitest)
npm run test:watch                        # Watch mode (re-run on changes)
npm run test:coverage                     # Generate coverage report
npx vitest run packages/agent/src/__tests__/riskEngine.test.ts  # Single file
```

### Code Quality

```bash
npm run lint                              # Check for linting errors
npm run lint:fix                          # Auto-fix linting errors
npm run format:check                      # Check formatting
npm run format                            # Auto-format code
```

### Building for Production

```bash
cd packages/agent && npm run build        # Compile agent TypeScript
cd packages/gateway && npm run build      # Compile gateway TypeScript
cd packages/frontend && npm run build     # Build frontend (outputs to dist/)
```

### Docker

```bash
docker compose up --build -d              # Build and start all services
docker compose logs -f                    # Stream logs
docker compose down                       # Stop all services
docker compose down -v                    # Stop and remove data volumes
```

### Verifying the System

```bash
# Check agent health and poller status
curl http://localhost:3002/health

# Check full system state (risk, brief, weather, satellites)
curl http://localhost:3001/api/v1/status

# Check satellite positions
curl http://localhost:3001/api/v1/satellites

# Check raw cached data from a specific source
curl http://localhost:3002/data/swpc-xray

# Force a new LLM brief generation
curl -X POST http://localhost:3001/api/v1/agent/brief
```

---

## Project Structure

```
sentinel/
├── packages/
│   ├── shared/                    # Shared TypeScript types
│   │   └── types.ts               # All domain interfaces
│   │
│   ├── agent/                     # Service 2 — port 3002
│   │   └── src/
│   │       ├── index.ts           # Entry point + cron scheduling
│   │       ├── router.ts          # API routes
│   │       ├── pollers/           # One file per data source
│   │       ├── dataCache.ts       # Cache wrapper
│   │       ├── riskEngine.ts      # Scoring engine
│   │       ├── llmBrief.ts        # Claude API
│   │       └── push.ts            # Gateway push
│   │
│   ├── gateway/                   # Service 1 — port 3001
│   │   └── src/
│   │       ├── index.ts           # Entry point + Socket.io
│   │       ├── routes.ts          # REST API + internal push
│   │       ├── satellites.ts      # TLE cache + SGP4
│   │       └── agentState.ts      # Agent state + alerts
│   │
│   └── frontend/                  # React app (Vite)
│       └── src/
│           ├── App.tsx            # Root component
│           ├── components/        # UI components
│           ├── hooks/             # Socket.io + satellite hooks
│           └── types/             # Frontend types
│
├── docs/                          # Documentation
├── .env                           # Environment variables (not committed)
├── package.json                   # Workspace root
└── .github/workflows/ci.yml     # CI pipeline
```

---

## Workflow

### Branch Strategy

| Branch Type | Pattern | Purpose |
|-------------|---------|---------|
| Main | `main` | Always deployable |
| Feature | `feature/short-description` | New functionality |
| Bug fix | `fix/short-description` | Bug fixes |

### Commit Message Format

Conventional Commits: `type(scope): description`

```
feat(agent/pollers): add SWPC X-ray flux poller
feat(gateway/satellites): fetch and propagate TLEs from CelesTrak
feat(frontend/globe): render satellite positions on 3D globe
fix(agent/risk-engine): correct compound scoring for concurrent flare and storm
docs(api): document gateway and agent endpoints
```

### Before Submitting a PR

```bash
npm run lint && npm run format:check
```

---

## Debugging

### Common Issues & Solutions

#### Agent fails to push to gateway
**Symptom:** `[Push] Gateway push failed` in agent logs
**Cause:** Gateway isn't running, or `INTERNAL_SECRET` mismatch
**Fix:** Start the gateway first. Verify both services share the same `INTERNAL_SECRET` in `.env`.

#### CORS errors in browser console
**Symptom:** Browser blocks requests to external APIs
**Cause:** External APIs (CelesTrak, SWPC) don't send CORS headers
**Fix:** All external API calls must go through backend pollers, never from React components. If you see CORS errors, check for direct browser-side fetch calls.

#### NASA API returning 403 or rate limit errors
**Symptom:** Pollers log 403 or 429 responses
**Cause:** Using `DEMO_KEY` (30 req/hour limit)
**Fix:** Register a free key at api.nasa.gov (1,000 req/hour). Set `NASA_API_KEY` in `.env`.

#### No LLM briefs generated
**Symptom:** Brief endpoint returns fallback brief with `confidence: 0.5`
**Cause:** `ANTHROPIC_API_KEY` not set in `.env`
**Fix:** Add your Claude API key to `.env`. Without it, deterministic fallback briefs are used (by design).

#### Globe not rendering / black screen
**Symptom:** Blank or black area where globe should be
**Cause:** `three` not installed as peer dependency
**Fix:** `npm install three` in the frontend package.

#### Socket.io not connecting
**Symptom:** Frontend shows stale data, no real-time updates
**Cause:** Gateway not running on expected port, or `VITE_GATEWAY_URL` mismatch
**Fix:** Verify gateway is on port 3001 and `VITE_GATEWAY_URL=http://localhost:3001` in `.env`.

#### Environment variables are empty
**Symptom:** Services start but API calls fail silently
**Cause:** dotenv loads from `../../.env` relative to each package's src directory
**Fix:** Always run services from their package directory (`cd packages/agent && npm run dev`). Check the `dotenv.config({ path: '../../.env' })` call.

### Debug Endpoints

| Endpoint | What It Shows |
|----------|--------------|
| `GET :3002/health` | Agent uptime, last poll timestamps, cache stats |
| `GET :3002/data/swpc-xray` | Raw cached SWPC X-ray data |
| `GET :3002/status` | Current risk score and breakdown |
| `GET :3001/api/v1/status` | Full system state |
| `GET :3001/api/v1/satellites` | All satellite positions |
| `GET :3001/api/v1/agent/health` | Agent health (proxied) |

### Tools

- **Backend:** Console logs with `[Module]` prefixes (`[SWPC]`, `[RiskEngine]`, `[LLM]`, etc.)
- **Frontend:** React DevTools + browser Network tab for Socket.io frames
- **API testing:** curl or any REST client

---

## IDE Setup

| Setting | Recommendation |
|---------|---------------|
| **IDE** | VSCode |
| **Extensions** | ESLint, Prettier, ES7+ React snippets |
| **Format on save** | Enabled |
| **Default formatter** | Prettier |
