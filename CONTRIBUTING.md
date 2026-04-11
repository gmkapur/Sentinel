# Contributing to Orbit Sentinel

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/<your-username>/sentinel.git`
3. Install dependencies: `npm install` from the monorepo root
4. Set up PostgreSQL and configure `DATABASE_URL` in `.env` (copy from `.env.example`)
5. Run Prisma migrations: `cd packages/gateway && npx prisma migrate dev`
6. Start all services: `npm run dev` (runs agent, gateway, and frontend concurrently)

## Development Setup

```bash
# Install all workspace dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your API keys (NASA_API_KEY is free at api.nasa.gov)

# Set up database
cd packages/gateway && npx prisma migrate dev --name init && cd ../..

# Start all services (3 terminals or use concurrently)
npm run dev
```

## Pull Request Process

### Before You Start

- Check existing issues and PRs to avoid duplicate work
- For large changes (new data source, new UI component, architectural changes), open an issue first to discuss the approach
- For bug fixes and small improvements, go ahead and open a PR directly

### Branch Naming

```
feat/short-description     # New features
fix/short-description      # Bug fixes
docs/short-description     # Documentation only
refactor/short-description # Code refactoring
```

### Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add amateur Kp data source poller
fix: handle null proton flux in compound scoring
docs: update API reference for v1 endpoints
refactor: extract Zod schemas to shared validation module
```

### PR Requirements

- [ ] All tests pass: `npm test`
- [ ] Linting passes: `npm run lint`
- [ ] Formatting passes: `npm run format:check`
- [ ] Build succeeds: `npm run build` in each affected package
- [ ] Risk engine tests cover any new scoring logic
- [ ] New API endpoints are documented in `docs/API_REFERENCE.md`
- [ ] New environment variables are added to `.env.example` with comments

### Review Criteria

PRs are reviewed for:
1. **Correctness** - Does it work? Does it handle edge cases?
2. **Security** - No exposed secrets, validated inputs, safe comparisons
3. **Consistency** - Follows existing patterns (structured logging, Zod validation, error handling)
4. **Scope** - Stays focused on one concern; doesn't bundle unrelated changes

## Adding a New Data Source

The agent's poller architecture supports extension without modifying the risk engine core:

1. Create `packages/agent/src/pollers/<source>.ts` implementing the fetch + cache pattern
2. Add a Zod schema for the external API response
3. Register the cron job in `packages/agent/src/index.ts`
4. Add the source to `dataCache.ts` key whitelist
5. Emit `RiskSignal` objects mapping to existing score categories
6. For new categories, extend `RiskBreakdown` in `packages/shared/src/types.ts`
7. Add test fixtures and tests in `packages/agent/src/__tests__/`
8. Document the data source in `docs/ARCHITECTURE.md` under External Dependencies

## Code Conventions

- **Runtime:** Node.js (not Bun/Deno)
- **Language:** TypeScript strict mode
- **Logging:** Structured logging via pino with `{ component: 'Name' }` child loggers
- **Validation:** Zod schemas on all external inputs (API responses, agent push, LLM output)
- **Error handling:** Pollers catch all errors and serve stale cache; never crash the process
- **Testing:** vitest with fixture data; test behavior, not implementation

## Questions?

Open an issue or check the documentation in `docs/`:
- [Architecture](docs/ARCHITECTURE.md) - System design and data flow
- [API Reference](docs/API_REFERENCE.md) - Endpoint documentation
- [Gotchas](docs/GOTCHAS.md) - Non-obvious API behaviors and pitfalls
- [Conventions](docs/CONVENTIONS.md) - Code style and patterns
