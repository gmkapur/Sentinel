# Testing Strategy

## Philosophy
- MVP ships without tests — testing is explicitly deferred to keep the 6-hour sprint focused on functionality
- When tests are added post-MVP: test behavior, not implementation. Focus on the risk engine scoring logic and poller data parsing as highest-value targets.
- **Coverage target**: No strict target for MVP. Post-MVP: critical paths must be covered (risk engine, pollers, API routes).

## Test Commands

```bash
# Run all tests
npm test

# Run a single test file
npx vitest run server/risk-engine.test.js

# Run tests matching a pattern
npx vitest run --grep "risk"

# Run tests in watch mode
npx vitest --watch

# Run tests with coverage report
npx vitest run --coverage
```

## Test Structure

```
tests/
├── unit/
│   ├── risk-engine.test.js    # Scoring logic with mock data
│   ├── pollers/
│   │   ├── swpc.test.js       # SWPC response parsing
│   │   ├── donki.test.js      # DONKI response parsing
│   │   └── celestrak.test.js  # OMM JSON parsing
│   └── utils/
│       └── propagation.test.js # satellite.js wrapper functions
├── integration/
│   ├── api/
│   │   ├── status.test.js     # GET /api/status
│   │   └── alerts.test.js     # GET /api/alerts
│   └── websocket.test.js      # Socket.io event flow
└── fixtures/
    ├── swpc-xray.json         # Sample SWPC X-ray response
    ├── donki-flare.json       # Sample DONKI solar flare response
    ├── celestrak-omm.json     # Sample CelesTrak OMM JSON
    └── neows-feed.json        # Sample NeoWs feed response
```

## Test Categories

### Unit Tests (highest priority post-MVP)
- **Location**: `tests/unit/`
- **Naming**: `[module].test.js`
- **Mocking strategy**: Mock axios responses with fixture JSON files. Never make real API calls in unit tests.
- **When to write**: Risk engine scoring logic (most critical), poller response parsing, utility functions

### Integration Tests
- **Location**: `tests/integration/`
- **External services**: Use fixture data injected into node-cache, not live API calls
- **When to write**: API route responses, Socket.io event broadcast on risk level changes

### End-to-End Tests
- **Location**: Not planned for MVP
- **Framework**: Playwright (when added)
- **When to write**: Post-MVP for critical user journeys (page load → globe render → alert display)

## Test Data & Fixtures
- **Fixtures**: Store sample API responses in `tests/fixtures/` — capture real responses and save as JSON
- **Risk scenarios**: Create fixtures for each risk level (LOW, MODERATE, HIGH, CRITICAL) with appropriate data combinations
- **Cleanup**: No database cleanup needed — tests use in-memory cache

## What Must Pass Before Merge
- [ ] All unit tests pass
- [ ] Linting passes with zero warnings
- [ ] Build completes without errors
- [ ] Risk engine produces correct scores for fixture-based scenarios

## Writing a New Test — Checklist
1. Create test file in the appropriate `tests/` subdirectory
2. Import the module under test and relevant fixtures from `tests/fixtures/`
3. Use `describe` blocks for the module, `it` blocks for behaviors
4. Test the happy path first, then error cases (API down / stale cache), then edge cases
5. For risk engine tests: verify both the score value and the risk level classification
6. Run the test in isolation before pushing: `npx vitest run path/to/test.js`

## Known Test Quirks
- satellite.js v7 is ESM-only — test runner must support ESM (Vitest handles this natively)
- Risk engine tests should set fixed timestamps to avoid flaky results from time-dependent logic
- Socket.io tests require a running server instance — use `beforeAll` to spin up a test server on a random port
