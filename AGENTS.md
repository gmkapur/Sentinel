# Sentinel

> Cross-tool agent context file (recognized by Claude Code, Cursor, GitHub Copilot,
> Windsurf, OpenAI Codex, and other AI coding agents).
> For Claude Code-specific context, see `CLAUDE.md`.

## What This Is
Orbit Sentinel is a satellite mission risk analysis platform that fuses real-time space weather data, orbital tracking, and 3D visualization into a unified risk dashboard. It scores compound radiation and geomagnetic threats to orbital assets using data from NOAA SWPC, NASA DONKI, CelesTrak, and NeoWs.

## Commands
```bash
# Install dependencies (workspace root)
npm install

# Start agent service (data pollers + risk engine, port 3002)
cd packages/agent && npm run dev

# Start gateway service (REST API + WebSocket, port 3001)
cd packages/gateway && npm run dev

# Start frontend (Vite dev server)
cd packages/frontend && npm run dev

# Lint / format
npm run lint
npm run format:check

# Build
cd packages/agent && npm run build
cd packages/gateway && npm run build
cd packages/frontend && npm run build
```

## Architecture
- **Entrypoints**: `packages/agent/src/index.ts` (Express + cron), `packages/gateway/src/index.ts` (Express + Socket.io), `packages/frontend/src/App.tsx` (React)
- **Core flow**: Agent pollers fetch space weather data on cron schedules → in-memory cache → risk engine fuses into 0–100 score → optional Claude LLM brief → HTTP push to gateway → Socket.io broadcast → React 3D globe + alert panels
- **Key modules**: `packages/agent/src/pollers/` (data fetchers), `packages/agent/src/riskEngine.ts` (scoring), `packages/agent/src/llmBrief.ts` (Claude API), `packages/gateway/src/satellites.ts` (SGP4 propagation), `packages/gateway/src/routes.ts` (REST API), `packages/shared/types.ts` (shared interfaces)

## Things That Will Bite You
- CelesTrak has CORS disabled — all requests go through backend pollers, never from the browser
- DONKI Notifications endpoint silently truncates queries longer than 30 days — use specific event endpoints (`/FLR`, `/CME`, `/GST`) for longer ranges
- `DEMO_KEY` for NASA APIs: 30 req/hour, 50/day — register free key at api.nasa.gov for 1,000/hour
- Inter-service auth uses `x-internal-secret` header — both agent and gateway must share `INTERNAL_SECRET` from `.env`
- Without `ANTHROPIC_API_KEY`, agent uses deterministic fallback briefs (no LLM calls)
- SWPC data updates every 1–5 min — polling faster wastes requests with no new data

## Code Conventions (Non-Default Only)
- TypeScript strict mode, ES2022 target, CommonJS modules
- npm workspaces monorepo: `packages/gateway`, `packages/agent`, `packages/frontend`, `packages/shared`
- All external API calls through server-side pollers in agent service only
- Risk scores use NOAA thresholds (M5+ flare, Kp ≥ 5, ≥10 pfu)
- Socket.io event names use kebab-case: `risk-update`, `risk-alert`, `satellite-positions`

## Agent Permissions
- May: Run lint, format, and type-check freely
- May: Create feature branches
- May: Read and modify any file in `packages/`
- Ask first: Before adding new npm dependencies
- Ask first: Before modifying CI/CD configuration (`.github/workflows/`)
- Never: Force push, delete branches, commit `.env` files, expose API keys in client code

## Documentation
See `docs/` folder for detailed reference:
- `docs/PROJECT_OVERVIEW.md` — Mission, goals, success metrics
- `docs/ARCHITECTURE.md` — System design, data flow, key decisions
- `docs/TECH_STACK.md` — Languages, frameworks, infrastructure
- `docs/DEVELOPMENT.md` — Setup, commands, workflow
- `docs/TESTING.md` — Test strategy, commands, structure
- `docs/CONVENTIONS.md` — Code patterns, naming, organization
- `docs/GOTCHAS.md` — Non-obvious pitfalls (highest value for agents)
- `docs/API_REFERENCE.md` — Endpoints, models, auth
- `docs/DEPLOYMENT.md` — CI/CD, environments, rollback
- `docs/SECURITY.md` — Auth, authorization, data protection
