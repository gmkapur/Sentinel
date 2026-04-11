# Tech Stack

## Runtime & Language

| Aspect | Choice | Rationale |
|--------|--------|-----------|
| **Language** | TypeScript (strict mode, ES2022 target) | Type safety across monorepo; shared interfaces between services |
| **Runtime** | Node.js 20+ | Native fetch, stable ESM, LTS support |
| **Module system** | CommonJS (backend), ESM (frontend via Vite) | CommonJS for backend compatibility with satellite.js; ESM via Vite bundler |
| **Target platforms** | Linux/macOS/Windows (dev), any Node.js host (prod) | — |

## Package Management

| Aspect | Choice |
|--------|--------|
| **Manager** | npm |
| **Workspace** | npm workspaces — root `package.json` with `"workspaces": ["packages/*"]` |
| **Lock file** | `package-lock.json` (always committed) |
| **Install** | `npm install` from root installs all workspace packages |

---

## Frameworks & Libraries

### Agent Service (`packages/agent`)

| Library | Version | Purpose | Why This Library |
|---------|---------|---------|-----------------|
| `express` | ^4.21 | HTTP server + REST API | Industry standard; lightweight for 6-route API |
| `@anthropic-ai/sdk` | latest | Claude API integration | Official SDK; type-safe; handles auth and retries |
| `node-cron` | ^3.0 | Cron-scheduled data pollers | In-process scheduling; no Redis/BullMQ infrastructure needed |
| `axios` | ^1.7 | HTTP client for external APIs | Used by all pollers for SWPC/DONKI/NeoWs/EONET |
| `node-cache` | ^5.1 | In-memory TTL cache | Zero-infrastructure; source-specific TTLs (300s-86400s) |
| `dotenv` | ^16.4 | Environment variable loading | Loads shared `.env` from monorepo root |
| `uuid` | ^9.0 | UUID generation | Alert record IDs |

### Gateway Service (`packages/gateway`)

| Library | Version | Purpose | Why This Library |
|---------|---------|---------|-----------------|
| `express` | ^4.21 | HTTP server + REST API | Client-facing endpoints; consistent with agent |
| `socket.io` | ^4.7 | WebSocket server | Real-time broadcasts (risk-update, satellite-positions) |
| `satellite.js` | ^5.0 | SGP4/SDP4 orbital propagation | `twoline2satrec()` with 3LE format; the standard for JS orbit math |
| `axios` | ^1.7 | HTTP client | Proxies requests to agent service |
| `node-cache` | ^5.1 | In-memory TLE cache | 2-hour TTL for TLE data |
| `cors` | ^2.8 | CORS middleware | Required: frontend on Vite dev server (different port) |
| `dotenv` | ^16.4 | Environment variable loading | Loads shared `.env` from monorepo root |
| `uuid` | ^9.0 | UUID generation | Alert record IDs |

### Frontend (`packages/frontend`)

| Library | Version | Purpose | Why This Library |
|---------|---------|---------|-----------------|
| `react` | 18.x | UI framework | Standard React SPA |
| `react-dom` | 18.x | React DOM renderer | — |
| `react-globe.gl` | latest | 3D globe visualization | Official satellite example; fast integration |
| `satellite.js` | ^5.0 | Client-side orbit propagation | Smooth rendering between server updates |
| `socket.io-client` | latest | WebSocket client | Receives real-time updates from gateway |
| `three` | latest | 3D rendering | Peer dependency of react-globe.gl |

### Development Tooling

| Tool | Version | Purpose |
|------|---------|---------|
| `typescript` | ^5.5+ | TypeScript compiler |
| `tsx` | ^4.16 | TypeScript execution with watch mode |
| `vite` | latest | Frontend build tool and dev server |
| `eslint` | ^9.25 | Linting (TypeScript + React plugins) |
| `prettier` | ^3.5 | Code formatting |
| `husky` | ^9.1 | Git hooks (pre-commit lint) |

---

## Shared Types

- **Location:** `packages/shared/types.ts`
- **Purpose:** TypeScript interfaces shared by agent and gateway
- **Key types:** `RiskState`, `RiskLevel`, `MissionBrief`, `SpaceWeatherState`, `AgentPushPayload`, `SatPosition`, `DONKIFlare`, `DONKICME`, `NEOObject`, `AlertRecord`
- **Import:** Relative path from each service (`../../shared/types`)

---

## Infrastructure Decisions

| Component | MVP Choice | Rationale | Post-MVP Path |
|-----------|-----------|-----------|---------------|
| **Database** | None (in-memory) | Zero setup; data is ephemeral | PostgreSQL + Prisma ORM |
| **Cache** | node-cache | In-memory TTL; sub-ms reads | Redis for horizontal scaling |
| **Message queue** | None (node-cron) | In-process scheduling sufficient | BullMQ for LLM request queue |
| **Search** | None | Not needed for MVP | — |
| **File storage** | None | Not needed | — |
| **Inter-service** | HTTP POST + shared secret | Simple; 2-service architecture | gRPC or message bus at scale |

## DevOps & Tooling

| Component | Tool | Status |
|-----------|------|--------|
| **CI/CD** | GitHub Actions (`.github/workflows/lint.yml`) | Active — lint + format on push/PR |
| **Containerization** | None | Skipped for MVP |
| **Monitoring** | Console logging with `[Module]` prefixes | Structured JSON post-MVP |
| **Error tracking** | None | Sentry post-MVP |

---

## Version Constraints

| Constraint | Reason |
|-----------|--------|
| Node.js >= 20 | Native fetch support, stable ESM |
| satellite.js ^5.0 | CommonJS interop via `esModuleInterop: true` |
| react-globe.gl requires `three` | Must install three.js explicitly as peer dependency |
| Backend = CommonJS | `"module": "commonjs"` in tsconfig for satellite.js compatibility |
| Frontend = ESM | Via Vite bundler |

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `GATEWAY_PORT` | No | `3001` | Gateway service port |
| `AGENT_PORT` | No | `3002` | Agent service port |
| `GATEWAY_URL` | No | `http://localhost:3001` | Gateway URL for agent push |
| `AGENT_URL` | No | `http://localhost:3002` | Agent URL for gateway proxy |
| `NASA_API_KEY` | Yes | — | NASA API key (free at api.nasa.gov) |
| `ANTHROPIC_API_KEY` | No | — | Claude API key for LLM briefs (fallback without it) |
| `INTERNAL_SECRET` | No | dev key | Shared secret for agent -> gateway auth |
| `VITE_GATEWAY_URL` | No | `http://localhost:3001` | Gateway URL for frontend |
