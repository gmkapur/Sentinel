# Things That Will Bite You

> This is the **highest-value document for AI agents**. Research shows that agents perform
> significantly better when told about non-obvious patterns they cannot infer from code alone.
>
> **Rules for this file:**
> - Only include genuinely surprising or counterintuitive things
> - Always explain WHY the gotcha exists, not just what it is
> - Update this file every time an agent (or human) makes a preventable mistake
> - Remove entries when the underlying issue is fixed

## Critical Gotchas
<!-- These will cause bugs or broken builds if ignored. -->

### [Gotcha 1 Title]
**What**: [DESCRIBE: the unexpected behavior]
**Why**: [EXPLAIN: why it works this way — the architectural reason]
**Correct approach**: [SHOW: what to do instead]
```
[FILL: code example if helpful]
```

### [Gotcha 2 Title]
**What**: [DESCRIBE]
**Why**: [EXPLAIN]
**Correct approach**: [SHOW]

## Environment Gotchas
<!-- Things that behave differently across dev/staging/prod. -->
- [FILL: e.g., "In dev, auth is bypassed — never test auth logic against localhost"]
- [FILL: e.g., "Staging uses a shared database — tests can interfere with QA"]
- [FILL: e.g., "Production uses read replicas — writes have ~100ms propagation delay"]

## Build & Tooling Gotchas
- [FILL: e.g., "Must run `pnpm generate` after changing any `.graphql` file"]
- [FILL: e.g., "Hot reload doesn't pick up changes to `.env` — restart the dev server"]
- [FILL: e.g., "TypeScript strict mode is ON — `noImplicitAny`, `strictNullChecks`, etc."]

## Database Gotchas
- [FILL: e.g., "Soft deletes: always filter `WHERE deleted_at IS NULL` — or use the `active` scope"]
- [FILL: e.g., "UUID primary keys — never use auto-increment assumptions"]
- [FILL: e.g., "Migrations must be backwards-compatible for zero-downtime deploys"]

## API Gotchas
- [FILL: e.g., "Auth tokens expire after 15 minutes — clients must implement refresh"]
- [FILL: e.g., "Rate limiting is per-IP in dev but per-API-key in production"]
- [FILL: e.g., "Pagination is cursor-based, not offset-based — see API_REFERENCE.md"]

## Testing Gotchas
- [FILL: e.g., "Integration tests require Docker running — `docker compose up -d test-db`"]
- [FILL: e.g., "Snapshot tests break on timezone differences — CI runs in UTC"]
- [FILL: e.g., "Mocking the clock? Remember to call `vi.useRealTimers()` in afterEach"]

## Third-Party Service Gotchas
- [FILL: e.g., "Stripe webhooks in dev require ngrok or Stripe CLI forwarding"]
- [FILL: e.g., "The external geolocation API returns 403 for localhost IPs"]

## Historical Decisions (Context for "Why is it like this?")
<!-- When agents encounter weird code, this explains the history. -->
- [FILL: e.g., "The legacy `/v1/users` endpoint returns a different shape than `/v2/users` — migration in progress, both must work until Q3"]
- [FILL: e.g., "We use a custom ORM wrapper because we migrated from Sequelize and the wrapper preserves query compatibility"]
