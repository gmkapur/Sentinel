# Security

> **For AI Agents**: This document defines security boundaries. When working on any code
> that touches API keys, data handling, or external services, read this document first
> and follow its constraints strictly.

## Authentication

### Auth Flow
- **Method**: No user authentication for MVP — the application is a read-only dashboard
- **Inter-service auth**: Agent → Gateway push authenticated via `x-internal-secret` header
- **API key management**: NASA and Claude API keys stored in `.env`, loaded via `dotenv`
- **External API auth**:
  - NASA DONKI/NeoWs: API key as `api_key` query parameter
  - NOAA SWPC: No authentication required
  - CelesTrak: No authentication required
  - NASA EONET: No authentication required
  - Claude API: `x-api-key` header + `anthropic-version` header

### Auth Boundaries
- All API keys are server-side only — never exposed to the frontend
- Frontend communicates only with the gateway service, never directly with external APIs or the agent
- No user sessions, no login, no authorization model for MVP
- Inter-service communication uses a shared secret (`INTERNAL_SECRET`) validated on the gateway's `/internal/agent-push` endpoint

## Authorization

### Permission Model
- **Type**: None for external users — MVP is a public read-only dashboard
- **Internal**: Agent service authorized to push to gateway via `INTERNAL_SECRET` header
- No roles, no access control, no multi-tenancy
- Post-MVP: consider API key-based access if exposing as a service

## Data Protection

### Sensitive Data
| Data Type | Storage | Encryption | Access Control |
|-----------|---------|------------|----------------|
| NASA API key | `.env` file, env vars | None (not a secret per se — free key) | Server process only (agent) |
| Claude API key | `.env` file, env vars | None at rest | Server process only (agent) |
| Internal secret | `.env` file, env vars | None at rest | Both agent and gateway processes |

### Data Handling Rules
- Never log API keys — sanitize environment variables before logging
- Never expose API keys in REST responses or WebSocket messages
- Never commit `.env` files to git
- All data from external APIs is public government data — no PII, no sensitive user data
- In-memory cache means no data persists to disk (except `.env`)
- The `ANTHROPIC_API_KEY` is the most sensitive credential — it has associated billing. Never expose it.

## Input Validation
- **NORAD IDs**: Validated as numeric integers in `/api/satellites/:noradId`
- **Data source names**: Validated against a whitelist in agent's `/data/:source` route
- **Internal push header**: `x-internal-secret` strictly compared against `INTERNAL_SECRET` env var
- **External data**: Treat all external API responses as untrusted — validate expected fields exist before accessing
- **LLM output**: Claude API responses are JSON-parsed with error handling; fallback to deterministic briefs on parse failure

## OWASP Top 10 Mitigations

| Vulnerability | Mitigation |
|--------------|------------|
| SQL Injection | No database — not applicable |
| XSS | React auto-escapes by default. No `dangerouslySetInnerHTML`. |
| CSRF | No state-changing operations from browser — read-only dashboard |
| Broken Auth | No user authentication — public dashboard. Inter-service auth uses shared secret. |
| Injection | No shell execution with user input. API route params validated. LLM output parsed as JSON only. |
| SSRF | Server-side pollers only fetch from hardcoded API URLs, not user-supplied URLs |
| Security Misconfiguration | CORS configured to allow all origins in dev (`cors: { origin: '*' }`). Restrict in production. |

## Secrets & Environment Variables
- **Secret storage**: `.env` file for local dev, platform env vars for production
- **Never committed**: `.env`, `*.pem`, `*.key`
- **gitignore**: Ensure `.env` is in `.gitignore`
- **Key rotation**: NASA keys don't expire. Claude API keys can be rotated via console.anthropic.com. Rotate `INTERNAL_SECRET` if compromised.

## API Key Security
- **NASA API key**: Free and non-sensitive, but should not be committed to git or exposed to clients
- **DEMO_KEY**: Public fallback with severe rate limits (30/hour) — always prefer a registered key
- **Claude API key**: Has billing implications — treat as sensitive. Never log, commit, or expose to frontend.
- **INTERNAL_SECRET**: Prevents unauthorized data injection into risk state. Use a strong random value in production.

## Security Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```
Post-MVP: add CSP, HSTS, and other headers via helmet middleware.

## Dependency Security
- Keep dependencies minimal per package to reduce attack surface
- Run `npm audit` periodically
- All dependencies are well-known, widely-used packages (Express, Socket.io, axios, etc.)
- No native modules or binary dependencies (except three.js WebGL)

## Rate Limit Awareness
External APIs have rate limits that could be abused if the server is exposed publicly:

| API | Limit | Risk |
|-----|-------|------|
| NASA (registered key) | 1,000 req/hour | Low — pollers are cron-scheduled |
| NASA (DEMO_KEY) | 30 req/hour, 50/day | Medium — easy to exhaust |
| CelesTrak | No formal limit, 2-hour courtesy | Low — data only updates 3x/day |
| Claude API | Per-plan limits | Low — brief generation is rate-limited by trigger conditions |

If exposing the Express API publicly, consider adding rate limiting middleware (`express-rate-limit`) to prevent abuse amplifying requests to upstream APIs.

## Inter-Service Security
- The gateway validates every agent push with `x-internal-secret` header comparison
- Agent push payload is trusted after header validation — no additional schema validation (MVP trade-off)
- Post-MVP: add JSON schema validation on the push payload to prevent malformed data from corrupting state
- Both services run on localhost in dev; in production, use private networking between containers
