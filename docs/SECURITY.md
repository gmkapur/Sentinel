# Security

> **For AI Agents**: This document defines security boundaries. When working on any code
> that touches API keys, data handling, or external services, read this document first
> and follow its constraints strictly.

## Authentication

### Auth Flow
- **Method**: No user authentication for MVP — the application is a read-only dashboard
- **API key management**: NASA API keys and optional third-party keys stored in `.env`, loaded via `dotenv`
- **External API auth**:
  - NASA DONKI/NeoWs: API key as `api_key` query parameter
  - NOAA SWPC: No authentication required
  - CelesTrak: No authentication required
  - N2YO: API key as `apiKey` query parameter
  - Space-Track: Cookie-based session via POST login (if used)
  - NASA EONET: No authentication required

### Auth Boundaries
- All API keys are server-side only — never exposed to the frontend
- Frontend communicates only with our Express backend, never directly with external APIs
- No user sessions, no login, no authorization model for MVP

## Authorization

### Permission Model
- **Type**: None — MVP is a public read-only dashboard
- No roles, no access control, no multi-tenancy
- Post-MVP: consider API key-based access if exposing as a service

## Data Protection

### Sensitive Data
| Data Type | Storage | Encryption | Access Control |
|-----------|---------|------------|----------------|
| NASA API key | `.env` file, env vars | None (not a secret per se — free key) | Server process only |
| Space-Track credentials | `.env` file, env vars | None at rest | Server process only |
| N2YO API key | `.env` file, env vars | None | Server process only |

### Data Handling Rules
- Never log API keys — sanitize environment variables before logging
- Never expose API keys in REST responses or WebSocket messages
- Never commit `.env` files to git
- All data from external APIs is public government data — no PII, no sensitive user data
- In-memory cache means no data persists to disk (except `.env`)

## Input Validation
- **Validation**: Minimal for MVP — validate NORAD IDs are numeric in `/api/satellite/:id`
- **External data**: Treat all external API responses as untrusted — validate expected fields exist before accessing
- **Query parameters**: Validate date formats (`yyyy-MM-dd`) before forwarding to NASA APIs

## OWASP Top 10 Mitigations

| Vulnerability | Mitigation |
|--------------|------------|
| SQL Injection | No database — not applicable |
| XSS | React auto-escapes by default. No `dangerouslySetInnerHTML`. |
| CSRF | No state-changing operations from browser — read-only dashboard |
| Broken Auth | No authentication — public dashboard |
| Injection | No shell execution with user input. API route params validated. |
| SSRF | Server-side pollers only fetch from hardcoded API URLs, not user-supplied URLs |
| Security Misconfiguration | CORS configured to allow only the Vite dev server origin |

## Secrets & Environment Variables
- **Secret storage**: `.env` file for local dev, platform env vars for production
- **Never committed**: `.env`, `*.pem`, `*.key`
- **gitignore**: Ensure `.env` is in `.gitignore`
- **Key rotation**: NASA keys don't expire. Rotate Space-Track password periodically.

## API Key Security
- NASA API keys are free and non-sensitive, but still should not be committed to git or exposed to clients
- The `DEMO_KEY` is a public fallback but has severe rate limits (30/hour) — always prefer a registered key
- Space-Track credentials grant access to orbital data catalogs — treat as moderately sensitive
- N2YO keys are free but tied to your account's rate limit quota

## Security Headers
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
```
Post-MVP: add CSP, HSTS, and other headers via helmet middleware.

## Dependency Security
- Keep dependencies minimal (7 backend, ~6 frontend) to reduce attack surface
- Run `npm audit` periodically
- All dependencies are well-known, widely-used packages (Express, Socket.io, axios, etc.)
- No native modules or binary dependencies (except three.js WebGL)

## Rate Limit Awareness
External APIs have rate limits that could be abused if the server is exposed publicly:

| API | Limit | Risk |
|-----|-------|------|
| NASA (registered key) | 1,000 req/hour | Low — pollers are cron-scheduled |
| NASA (DEMO_KEY) | 30 req/hour, 50/day | Medium — easy to exhaust |
| Space-Track | 30 req/min, 300 req/hour | High — violations trigger warnings |
| CelesTrak | No formal limit, 2-hour courtesy | Low — data only updates 3x/day |
| N2YO | 1,000 req/hour | Low — pollers are scheduled |

If exposing the Express API publicly, consider adding rate limiting middleware (`express-rate-limit`) to prevent abuse amplifying requests to upstream APIs.
