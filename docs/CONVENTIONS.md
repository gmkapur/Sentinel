# Code Conventions

> **Principle**: Only document conventions that DEVIATE from the language/framework defaults.
> Standard patterns (e.g., React components in PascalCase) don't need to be listed —
> agents infer these from existing code. Focus on the surprising or non-standard.

## File & Directory Naming
- Backend source files use camelCase: `riskEngine.ts`, `dataCache.ts`, `agentState.ts`
- Poller files are named after the data source: `swpc.ts`, `donki.ts`, `neows.ts`, `eonet.ts`
- React components use PascalCase: `GlobeView.tsx`, `AlertPanel.tsx`, `RiskBanner.tsx`
- Hook files use camelCase with `use` prefix: `useSocket.ts`, `useSatellites.ts`
- Test files co-located in `tests/` directory, mirroring source structure: `tests/unit/agent/riskEngine.test.ts`

## Code Organization Patterns

### Monorepo Structure
```
packages/
├── shared/              # Shared TypeScript interfaces (types.ts)
├── agent/src/           # Autonomous reasoning engine
│   ├── pollers/         # One file per data source (swpc.ts, donki.ts, neows.ts, eonet.ts)
│   ├── dataCache.ts     # Centralized cache with source-specific TTLs
│   ├── riskEngine.ts    # Fusion scoring logic
│   ├── llmBrief.ts      # Claude API integration
│   ├── push.ts          # Gateway push module
│   ├── router.ts        # Express routes
│   └── index.ts         # Entry point + cron scheduling
├── gateway/src/         # Client-facing service
│   ├── satellites.ts    # TLE cache + SGP4 propagation
│   ├── agentState.ts    # In-memory agent state store
│   ├── routes.ts        # Express routes + internal push endpoint
│   └── index.ts         # Entry point + Socket.io setup
└── frontend/src/        # React app
    ├── components/      # One file per UI component
    ├── hooks/           # Custom React hooks
    └── types/           # Frontend TypeScript interfaces
```

### Import Order
1. Node built-ins (`import http from 'http'`)
2. External packages (`import express from 'express'`)
3. Internal modules (`import { evaluate } from './riskEngine'`)

Blank line between each group.

## Naming Conventions
- API route paths use kebab-case: `/api/space-weather`, `/api/agent/brief`
- Environment variables use UPPER_SNAKE_CASE: `NASA_API_KEY`, `INTERNAL_SECRET`
- Cache keys use dash-delimited strings: `swpc-xray`, `donki-flares`, `swpc-mag`
- Risk levels are uppercase string constants: `LOW`, `MODERATE`, `HIGH`, `CRITICAL`
- Recommendations are uppercase: `GO`, `CAUTION`, `NO-GO`
- Socket.io event names use kebab-case: `risk-alert`, `risk-update`, `satellite-positions`, `space-weather`
- Threat types use snake_case: `solar_flare`, `geomagnetic_storm`, `radiation_storm`

## TypeScript Conventions
- Strict mode enabled in all packages
- ES2022 target, CommonJS modules (backend), ESM (frontend via Vite)
- Shared interfaces defined in `packages/shared/types.ts`, imported with relative paths
- Use `as const` for constant objects (cache keys, TTLs)
- Prefer explicit return types on exported functions
- Use `interface` for object shapes, `type` for unions and aliases

## Error Handling
- Pollers catch all errors and log them — never let a failed API call crash the server
- Serve stale cached data when an API is down (graceful degradation)
- API routes return `{ error: "message" }` format on failure
- Never throw raw strings — always throw Error instances
- LLM calls have deterministic fallback when API is unavailable

## Async Patterns
- Always use async/await, never raw Promises with `.then()`
- Pollers are independent — a failure in one never blocks others
- Use try/catch in every poller function with logging on catch
- Use `Promise.allSettled()` for parallel initial fetch (never `Promise.all()` — one failure shouldn't block others)

## Data Format Conventions
- Dates in API responses use ISO 8601 format
- Coordinates use decimal degrees (latitude, longitude) and kilometers (altitude)
- Risk scores are integers 0–100
- Timestamps in internal payloads are Unix milliseconds (`Date.now()`)

## Dependency Rules
- Keep dependencies minimal per package
- No Redis, no database, no BullMQ — use in-memory alternatives
- All external data fetching goes through server-side pollers in the agent — never from the client
- Inter-service communication uses HTTP POST with `x-internal-secret` header
