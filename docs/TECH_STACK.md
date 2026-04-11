# Tech Stack

## Runtime & Language
- **Language**: TypeScript (strict mode, ES2022 target)
- **Runtime**: Node.js 20+
- **Module system**: CommonJS (backend services), ESM (frontend via Vite)
- **Target platforms**: Linux/macOS/Windows (development), any Node.js hosting (deployment)

## Package Management
- **Package manager**: npm
- **Workspace setup**: npm workspaces — root `package.json` with `"workspaces": ["packages/*"]`
- **Lock file**: `package-lock.json` — always commit this
- **Install command**: `npm install` (from root installs all workspace packages)

## Frameworks & Libraries

### Core (Agent Service — `packages/agent`)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `express` | ^4.21 | HTTP server and REST API routing | Lightweight 6-route API |
| `node-cron` | ^3.0 | Cron-based scheduling for data pollers | Replaces BullMQ/Redis for MVP simplicity |
| `axios` | ^1.7 | HTTP client for external API requests + Claude API | Used by all pollers and LLM module |
| `node-cache` | ^5.1 | In-memory TTL cache | Source-specific TTLs (300s–86400s) |
| `dotenv` | ^16.4 | Environment variable loading | Loads shared `.env` from root |
| `uuid` | ^9.0 | UUID generation | Used for alert record IDs |

### Core (Gateway Service — `packages/gateway`)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `express` | ^4.21 | HTTP server and REST API routing | Client-facing endpoints |
| `socket.io` | ^4.7 | WebSocket server for real-time updates | Broadcasts risk-update, risk-alert, satellite-positions |
| `satellite.js` | ^5.0 | SGP4/SDP4 orbital propagation | Uses `twoline2satrec()` with 3LE format |
| `axios` | ^1.7 | HTTP client for agent proxy requests | Proxies brief/health to agent |
| `node-cache` | ^5.1 | In-memory TLE cache | 2-hour TTL for TLE data |
| `cors` | ^2.8 | CORS middleware for Express | Required since frontend runs on separate Vite dev server |
| `dotenv` | ^16.4 | Environment variable loading | Loads shared `.env` from root |
| `uuid` | ^9.0 | UUID generation | Used for alert record IDs |

### Core (Frontend — `packages/frontend`)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `react` | 18.x | UI framework | Standard React SPA |
| `react-dom` | 18.x | React DOM renderer | |
| `react-globe.gl` | latest | 3D globe visualization | Official satellite example available in repo |
| `satellite.js` | ^5.0 | SGP4/SDP4 orbital propagation | Client-side propagation for smooth rendering |
| `socket.io-client` | latest | WebSocket client | Receives real-time updates from gateway |
| `three` | latest | 3D rendering (peer dep of globe.gl) | Required by react-globe.gl |

### Development (all packages)
| Library | Version | Purpose |
|---------|---------|---------|
| `typescript` | ^5.5+ | TypeScript compiler |
| `tsx` | ^4.16 | TypeScript execution (dev mode with watch) |
| `@types/express` | ^4.17 | Express type definitions |
| `@types/node` | ^20.14 | Node.js type definitions |
| `@types/node-cron` | ^3.0 | node-cron type definitions |
| `@types/cors` | ^2.8 | cors type definitions |
| `@types/uuid` | ^9.0 | uuid type definitions |
| `@types/three` | latest | three.js type definitions |
| `vite` | latest | Frontend build tool and dev server |
| `eslint` | ^9.25 | Linting (with TypeScript + React plugins) |
| `prettier` | ^3.5 | Code formatting |
| `husky` | ^9.1 | Git hooks (pre-commit lint) |

## Shared Types
- **Location**: `packages/shared/types.ts`
- **Purpose**: TypeScript interfaces shared by agent and gateway services
- **Key types**: `RiskState`, `RiskLevel`, `MissionBrief`, `SpaceWeatherState`, `AgentPushPayload`, `SatPosition`, `DONKIFlare`, `DONKICME`, `NEOObject`, `AlertRecord`

## Infrastructure
- **Database**: None (in-memory node-cache for MVP)
- **Cache**: node-cache (in-memory with per-source TTLs)
- **Message queue**: None (node-cron handles scheduling)
- **Search**: None
- **File storage**: None
- **Inter-service communication**: HTTP POST with shared secret header

## DevOps & Tooling
- **CI/CD**: GitHub Actions (`.github/workflows/lint.yml`) — lint + format check on push/PR
- **Containerization**: None for MVP (skip Docker)
- **Orchestration**: None
- **Monitoring**: Console logging (structured logs post-MVP)
- **Error tracking**: None for MVP

## Version Constraints
- Node.js >= 20 required for native fetch support and stable ESM
- satellite.js ^5.0 used with CommonJS interop (`esModuleInterop: true` in tsconfig)
- react-globe.gl requires `three` as a peer dependency — install it explicitly
- Backend services use CommonJS modules (`"module": "commonjs"` in tsconfig)
- Frontend uses ESM via Vite bundler

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `GATEWAY_PORT` | No | Gateway service port (default: 3001) | `3001` |
| `AGENT_PORT` | No | Agent service port (default: 3002) | `3002` |
| `GATEWAY_URL` | No | Gateway URL for agent push (default: `http://localhost:3001`) | `http://localhost:3001` |
| `AGENT_URL` | No | Agent URL for gateway proxy (default: `http://localhost:3002`) | `http://localhost:3002` |
| `NASA_API_KEY` | Yes | NASA API key for DONKI and NeoWs (free at api.nasa.gov) | `your-nasa-api-key` |
| `ANTHROPIC_API_KEY` | No | Claude API key for LLM mission briefs (fallback briefs without it) | `sk-ant-...` |
| `INTERNAL_SECRET` | No | Shared secret for agent→gateway auth (default: dev key) | `orbit-sentinel-internal-dev-key` |
| `VITE_GATEWAY_URL` | No | Gateway URL for frontend (default: `http://localhost:3001`) | `http://localhost:3001` |
