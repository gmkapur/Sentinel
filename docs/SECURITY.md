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
| Public API | None | Read-only dashboard — no user auth for MVP |
| Inter-service | Shared secret header | `x-internal-secret` on `/internal/agent-push` |
| NASA APIs | API key query param | `api_key` parameter from `NASA_API_KEY` env var |
| NOAA SWPC | None | Public JSON endpoints |
| CelesTrak | None | Public data mirror |
| Claude API | API key header | `x-api-key` from `ANTHROPIC_API_KEY` env var |

### Auth Boundaries

- All API keys are server-side only — never exposed to the frontend
- Frontend communicates only with the gateway, never with external APIs or the agent
- No user sessions, no login, no authorization model for MVP
- Post-MVP: consider API key-based access if exposing as a public service

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

| Input | Validation |
|-------|-----------|
| NORAD IDs (`:noradId`) | Validated as numeric integers |
| Data source names (`:source`) | Validated against whitelist of valid source keys |
| Internal push header | Strict string comparison of `x-internal-secret` |
| External API responses | Treated as untrusted — validate expected fields before accessing |
| LLM output | JSON-parsed with error handling; fallback to deterministic briefs on parse failure |

---

## OWASP Top 10 Mitigations

| Vulnerability | Status | Mitigation |
|--------------|--------|------------|
| **SQL Injection** | N/A | No database (in-memory cache only) |
| **XSS** | Mitigated | React auto-escapes by default. No `dangerouslySetInnerHTML`. |
| **CSRF** | N/A | No state-changing operations from browser — read-only dashboard |
| **Broken Authentication** | Accepted risk | No user auth for MVP. Inter-service uses shared secret. |
| **Injection** | Mitigated | No shell execution with user input. Route params validated. LLM output parsed as JSON only. |
| **SSRF** | Mitigated | Pollers only fetch from hardcoded API URLs, not user-supplied URLs |
| **Security Misconfiguration** | Partial | CORS allows all origins in dev (`origin: '*'`). Restrict in production. |
| **Vulnerable Dependencies** | Monitored | Run `npm audit` periodically. All deps are well-known packages. |

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

External APIs have rate limits that could be amplified if the server is exposed publicly:

| API | Limit | Risk Level |
|-----|-------|-----------|
| NASA (registered key) | 1,000 req/hour | Low — pollers are cron-scheduled |
| NASA (DEMO_KEY) | 30 req/hour, 50/day | Medium — easy to exhaust |
| CelesTrak | No formal limit, 2-hour courtesy | Low — data updates 3x/day |
| Claude API | Per-plan limits | Low — generation rate-limited by trigger conditions |

**Post-MVP:** Add `express-rate-limit` middleware to prevent abuse that amplifies requests to upstream APIs.

---

## Inter-Service Security

| Control | Status |
|---------|--------|
| Header validation on agent push | Active — `x-internal-secret` comparison |
| Push payload schema validation | Not implemented (MVP trade-off) |
| Network isolation | Localhost in dev; private networking in production |
| TLS between services | Not implemented in dev; required in production |

Post-MVP: Add JSON schema validation on push payload (Zod or JSON Schema) to prevent malformed data from corrupting state.
