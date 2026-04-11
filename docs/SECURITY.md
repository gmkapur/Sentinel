# Security

> When working on code that touches API keys, data handling, or external services, follow these constraints strictly.

---

## Threat Model

### Attack Surface

| Surface | Exposure | Risk |
|---------|----------|------|
| Gateway REST API (`:3001`) | Public (no auth) | Low — read-only dashboard, no user data |
| Gateway WebSocket | Public | Low — server-to-client only, no client commands |
| Agent API (`:3002`) | Internal only (localhost) | Low — not exposed externally |
| Agent push endpoint | Internal with shared secret | Medium — data injection if secret compromised |
| External API keys | Server-side `.env` | Medium — Claude API key has billing implications |

### Trust Boundaries

```
UNTRUSTED                    TRUSTED
─────────────────────────────────────────────
Browser (frontend)    ──►    Gateway REST/WS
External API responses ──►   Agent pollers
Claude API response   ──►    llmBrief.ts
Agent push payload    ──►    Gateway (after x-internal-secret validation)
```

---

## Authentication

### Auth Model

| Context | Method | Details |
|---------|--------|---------|
| Public API (`/api/v1/*`) | API key header | `x-api-key` header validated with timing-safe comparison. Bypassed in development mode (`NODE_ENV=development`). |
| Internal API (`/internal/*`) | Shared secret header | `x-internal-secret` validated with timing-safe comparison (`crypto.timingSafeEqual`). **Always enforced** regardless of environment. |
| NASA APIs | API key query param | `api_key` parameter from `NASA_API_KEY` env var |
| NOAA SWPC | None | Public JSON endpoints |
| CelesTrak | None | Public data mirror |
| Claude API | API key header | `x-api-key` from `ANTHROPIC_API_KEY` env var (managed by Anthropic SDK) |

### Auth Implementation

- **API key validation**: `middleware.ts` uses `requireApiKey(env)` on all `/api/v1/*` routes. Keys are compared using `crypto.timingSafeEqual` to prevent timing attacks. When key lengths differ, a self-comparison is performed to maintain constant timing.
- **Internal secret validation**: `requireInternalSecret(env)` on all `/internal/*` routes. Same timing-safe comparison. This is never bypassed — agent-to-gateway communication always requires the shared secret.
- **Development mode**: When `NODE_ENV=development`, public API routes skip API key checks to simplify local development. Internal routes still require authentication.
- **Rate limiting**: `express-rate-limit` enforces 120 requests/minute per IP on all `/api/v1/*` routes.
- **Security headers**: `helmet` middleware sets `X-Content-Type-Options`, `X-Frame-Options`, and other security headers on all responses.

### Auth Boundaries

- All API keys are server-side only — never exposed to the frontend
- Frontend communicates only with the gateway via Vite's dev proxy, never with external APIs or the agent
- No user sessions, no login, no authorization model for MVP
- API key authentication is enforced in production; disabled only in development for convenience

---

## Data Protection

### Sensitive Data Inventory

| Data | Location | Sensitivity | Protection |
|------|----------|-------------|-----------|
| `ANTHROPIC_API_KEY` | `.env`, process env | **High** (has billing) | Never log, commit, or send to frontend |
| `NASA_API_KEY` | `.env`, process env | Low (free key) | Don't commit to git; don't expose to clients |
| `INTERNAL_SECRET` | `.env`, process env | Medium | Prevents unauthorized data injection |

### Data Handling Rules

1. **Never log API keys** — sanitize environment variables before any logging
2. **Never expose keys in responses** — REST and WebSocket messages must not contain secrets
3. **Never commit `.env`** — `.gitignore` includes `.env`, `*.pem`, `*.key`
4. **All external data is public** — NOAA/NASA data contains no PII or sensitive user data
5. **In-memory cache = no data at rest** — except the `.env` file itself

---

## Input Validation

| Input | Validation | Implementation |
|-------|-----------|----------------|
| NORAD IDs (`:noradId`) | Validated as numeric integers | `parseInt()` with `isNaN()` check in route handlers |
| Data source names (`:source`) | Validated against whitelist of valid source keys | Explicit whitelist in agent `router.ts` |
| Agent push payload | Full Zod schema validation | `agentPushSchema.safeParse()` in `routes.ts` — validates all nested fields including risk state, space weather, flares, CMEs, NEOs, EONET events, and flare path predictions |
| Internal push header | Timing-safe string comparison of `x-internal-secret` | `crypto.timingSafeEqual` via `safeCompare()` in `middleware.ts` |
| API key header | Timing-safe string comparison of `x-api-key` | Same `safeCompare()` function |
| External API responses (pollers) | Zod schemas validate response structure before processing | Per-poller schemas in `pollers/*.ts` — validates SWPC JSON arrays, DONKI event objects, NeoWs nested structure, EONET event arrays |
| LLM output | Zod schema validation on Claude's JSON response | `missionBriefSchema.safeParse()` in `llmBrief.ts` — validates recommendation enum, threats array, confidence range; falls back to deterministic brief on validation failure |

---

## OWASP Top 10 Mitigations

| Vulnerability | Status | Mitigation |
|--------------|--------|------------|
| **SQL Injection** | Mitigated | PostgreSQL via Prisma ORM — all queries use parameterized prepared statements. No raw SQL. |
| **XSS** | Mitigated | React auto-escapes by default. No `dangerouslySetInnerHTML`. LLM output rendered as text only. |
| **CSRF** | N/A | No state-changing operations from browser — read-only dashboard. POST endpoints are API-only. |
| **Broken Authentication** | Mitigated | API key auth (`x-api-key`) with timing-safe comparison on public routes. Internal routes require `x-internal-secret`. Rate limiting prevents brute force. |
| **Injection** | Mitigated | No shell execution with user input. Route params validated. LLM output validated with Zod schema before storing. Prisma prevents SQL injection. |
| **SSRF** | Mitigated | Pollers only fetch from hardcoded API URLs, not user-supplied URLs. Agent proxy routes in gateway use hardcoded `AGENT_URL`. |
| **Security Misconfiguration** | Partial | `helmet` middleware sets security headers. CORS allows all origins in dev (`origin: '*'`). Restrict in production. |
| **Vulnerable Dependencies** | Monitored | Run `npm audit` periodically. CI runs `npm ci` (clean install). All deps are well-known packages. |

---

## Secrets Management

| Environment | Strategy |
|-------------|----------|
| Development | `.env` file at monorepo root |
| Production | Platform environment variables (Railway, Fly.io, Render) |
| CI | GitHub Actions secrets |

### Key Rotation

| Secret | Rotation Policy |
|--------|----------------|
| `NASA_API_KEY` | Doesn't expire. Replace if compromised. |
| `ANTHROPIC_API_KEY` | Rotate via console.anthropic.com if compromised |
| `INTERNAL_SECRET` | Use strong random value in production. Rotate if compromised. |

---

## Security Headers

Currently configured:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```

Post-MVP additions:
- Content Security Policy (CSP)
- HTTP Strict Transport Security (HSTS)
- Additional headers via `helmet` middleware

---

## Rate Limit Awareness

### Internal Rate Limiting

`express-rate-limit` middleware is active on all `/api/v1/*` routes: 120 requests per minute per IP. Configured in `middleware.ts`:

```
windowMs: 60 * 1000   // 1-minute window
max: 120               // per IP
standardHeaders: true  // RateLimit-* headers in response
```

### External API Rate Limits

| API | Limit | Risk Level |
|-----|-------|-----------|
| NASA (registered key) | 1,000 req/hour | Low — pollers are cron-scheduled |
| NASA (DEMO_KEY) | 30 req/hour, 50/day | Medium — easy to exhaust |
| CelesTrak | No formal limit, 2-hour courtesy | Low — data updates 3x/day |
| Claude API | Per-plan limits | Low — generation rate-limited by trigger conditions |

---

## Inter-Service Security

| Control | Status |
|---------|--------|
| Header validation on agent push | **Active** — `x-internal-secret` with timing-safe comparison (`crypto.timingSafeEqual`) |
| Push payload schema validation | **Active** — Full Zod schema validation on `AgentPushPayload` in `routes.ts` (validates risk state, space weather, flares, CMEs, NEOs, EONET events, flare path predictions) |
| Network isolation | Localhost in dev; private networking in production |
| TLS between services | Not implemented in dev; required in production |
| Rate limiting on public API | **Active** — `express-rate-limit` at 120 req/min per IP on `/api/v1/*` |
| Security headers | **Active** — `helmet` middleware on all responses |
