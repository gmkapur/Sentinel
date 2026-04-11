# Code Conventions

> Only documents conventions that deviate from language/framework defaults. Standard patterns (React components in PascalCase, Express route handlers) are inferred from existing code.

---

## File & Directory Naming

| Context | Convention | Examples |
|---------|-----------|----------|
| Backend source files | camelCase | `riskEngine.ts`, `dataCache.ts`, `agentState.ts` |
| Poller files | Named after data source | `swpc.ts`, `donki.ts`, `neows.ts`, `eonet.ts` |
| React components | PascalCase | `GlobeView.tsx`, `AlertPanel.tsx`, `RiskBanner.tsx` |
| React hooks | camelCase with `use` prefix | `useSocket.ts`, `useSatellites.ts` |
| Test files | Mirror source structure in `tests/` | `tests/unit/agent/riskEngine.test.ts` |

---

## Monorepo Organization

```
packages/
├── shared/              # Types only (no runtime code)
├── agent/src/           # Autonomous reasoning engine
│   ├── pollers/         # One file per data source
│   ├── dataCache.ts     # Centralized cache
│   ├── riskEngine.ts    # Scoring logic
│   ├── llmBrief.ts      # Claude integration
│   ├── push.ts          # Gateway push
│   ├── router.ts        # Express routes
│   └── index.ts         # Entry + cron scheduling
├── gateway/src/         # Client-facing service
│   ├── satellites.ts    # TLE cache + SGP4
│   ├── agentState.ts    # In-memory state store
│   ├── routes.ts        # Express routes + internal push
│   └── index.ts         # Entry + Socket.io
└── frontend/src/        # React app
    ├── components/      # One file per component
    ├── hooks/           # Custom React hooks
    └── types/           # Frontend interfaces
```

---

## Naming Conventions

| Context | Convention | Examples |
|---------|-----------|----------|
| API route paths | kebab-case with `/api/v1/` prefix | `/api/v1/space-weather`, `/api/v1/agent/brief` |
| Environment variables | UPPER_SNAKE_CASE | `NASA_API_KEY`, `INTERNAL_SECRET` |
| Cache keys | dash-delimited | `swpc-xray`, `donki-flares`, `swpc-mag` |
| Risk levels | Uppercase constants | `LOW`, `MODERATE`, `HIGH`, `CRITICAL` |
| Recommendations | Uppercase constants | `GO`, `CAUTION`, `NO-GO` |
| Socket.io events | kebab-case | `risk-alert`, `risk-update`, `satellite-positions` |
| Threat types | snake_case | `solar_flare`, `geomagnetic_storm`, `radiation_storm` |

---

## Import Order

1. Node built-ins (`import http from 'http'`)
2. External packages (`import express from 'express'`)
3. Internal modules (`import { evaluate } from './riskEngine'`)

Blank line between each group.

---

## TypeScript Conventions

| Rule | Details |
|------|---------|
| Strict mode | Enabled in all packages |
| Target | ES2022, CommonJS (backend), ESM (frontend) |
| Shared types | `packages/shared/types.ts`, imported via relative paths |
| Constants | Use `as const` for constant objects (cache keys, TTLs) |
| Return types | Explicit on exported functions |
| Object shapes | Use `interface` |
| Unions/aliases | Use `type` |

---

## Error Handling

| Rule | Rationale |
|------|-----------|
| Pollers catch all errors and log | Never let a failed API call crash the server |
| Serve stale cache on API failure | Graceful degradation — some data is better than none |
| API routes return `{ error: "message" }` | Consistent error shape for frontend |
| Never throw raw strings | Always throw `Error` instances |
| LLM calls have deterministic fallback | System works without Claude API key |

---

## Async Patterns

| Rule | Rationale |
|------|-----------|
| Always use `async/await` | Never raw `.then()` chains |
| Pollers are independent | One failure never blocks others |
| `try/catch` in every poller | With logging on catch |
| `Promise.allSettled()` for parallel fetch | Never `Promise.all()` — one failure shouldn't block the rest |

---

## Data Formats

| Data Type | Format |
|-----------|--------|
| Dates in API responses | ISO 8601 |
| Coordinates | Decimal degrees (lat, lng), kilometers (alt) |
| Risk scores | Integer 0-100 |
| Internal timestamps | Unix milliseconds (`Date.now()`) |

---

## Dependency Rules

| Rule | Rationale |
|------|-----------|
| Minimal dependencies per package | Reduce attack surface and bundle size |
| No Redis, no database, no BullMQ for MVP | In-memory alternatives; zero infrastructure |
| All external data fetching via agent pollers | Never from the client (CORS, security) |
| Inter-service auth via `x-internal-secret` | Prevents unauthorized data injection |
