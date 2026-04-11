# Testing Strategy

## Philosophy

Tests are organized by priority — the risk engine scoring logic receives the most thorough coverage, followed by data parsing and API route contracts. Tests follow these priorities:

1. **Risk engine scoring logic** — Highest value. Incorrect risk scores have the most user impact.
2. **Poller data parsing** — Validates that real API responses are correctly transformed.
3. **API route contracts** — Ensures frontend integration works.
4. **Socket.io event flow** — Validates real-time update pipeline.

> **Principle:** Test behavior, not implementation. Test the risk engine's output for a given input, not its internal data structures.

---

## Test Commands

```bash
# Run all tests
npm test

# Run a specific test file
npx vitest run packages/agent/src/riskEngine.test.ts

# Run tests matching a pattern
npx vitest run --grep "risk"

# Watch mode (re-run on file changes)
npx vitest --watch

# Coverage report
npx vitest run --coverage
```

---

## Test Structure

Tests are colocated with source files using `__tests__/` directories:

```
packages/agent/src/__tests__/
├── riskEngine.test.ts     # Score calculation, compound synergy, level mapping
├── scenarios.test.ts      # End-to-end scoring with historical fixtures (G5 storm, quiet sun, moderate)
├── llmBrief.test.ts       # Brief generation, fallback path, trigger conditions
├── dataCache.test.ts      # Cache TTL behavior, source-specific TTLs
├── cmeGeometry.test.ts    # CME cone geometry calculations
├── cmeRiskScoring.test.ts # CME path scoring and synergy rules
├── env.test.ts            # Environment variable validation
└── fixtures.ts            # Typed fixture data (G5 storm, quiet sun, moderate event)

packages/gateway/src/__tests__/
└── satRisk.test.ts        # Per-satellite risk scoring, subsolar point, SAA detection
```

### Fixture Data

Typed fixture data in `packages/agent/src/__tests__/fixtures.ts` provides reproducible test inputs based on real historical events:

- **May 2024 G5 Storm** — X5.8 flare, Kp 9, proton flux 500, solar wind 900 km/s, Bz -25 nT → validates CRITICAL (score 100)
- **Quiet Sun** — No activity → validates LOW (score 0)
- **Moderate M-class Event** — M3.2 flare, Kp 4, proton flux 5 → validates MODERATE (score 20-39)

---

## Test Categories

### Unit Tests (Highest Priority)

**Location:** `tests/unit/`
**Mocking:** Mock axios responses with fixture JSON files. Never make real API calls in unit tests.

| Module | What to Test | Priority |
|--------|-------------|----------|
| `riskEngine.ts` | Score calculation for each risk level; compound synergy rules fire correctly; score capping at 100 | Critical |
| `pollers/*.ts` | Correct parsing of real API response formats; trend computation; cache write calls | High |
| `llmBrief.ts` | Brief generation with mock Claude response; deterministic fallback path; trigger condition logic | High |
| `dataCache.ts` | TTL behavior; source-specific TTL enforcement; cache miss handling | Medium |
| `satellites.ts` | TLE parsing; SGP4 propagation produces valid lat/lng/alt | Medium |
| `agentState.ts` | Alert history cap (100 records); state overwrite on push | Medium |

### Integration Tests

**Location:** `tests/integration/`
**Strategy:** Use fixture data injected into node-cache, not live API calls.

| Test | What It Validates |
|------|------------------|
| Agent router | All agent API routes return correct shapes |
| Gateway routes | REST endpoints return expected data models |
| WebSocket flow | Risk level change triggers Socket.io broadcast |
| Agent push | POST to /internal/agent-push updates gateway state and triggers alerts |

### End-to-End Tests (Post-MVP)

**Framework:** Playwright
**Scope:** Critical user journeys — page load, globe render, alert display, brief panel

---

## Test Data & Fixtures

- **Source:** Capture real API responses and save as JSON in `tests/fixtures/`
- **Risk scenarios:** Create fixture sets for each level:
  - `LOW` — Nominal conditions (C-class flare, Kp 2)
  - `MODERATE` — Elevated (M2 flare, Kp 4, solar wind 520 km/s)
  - `HIGH` — Significant (M6 flare, Kp 6, compound synergy triggers)
  - `CRITICAL` — Severe compound (X5 flare, Kp 9, proton flux 500 pfu)
- **Cleanup:** No database cleanup needed — tests use in-memory cache

---

## Merge Checklist

- [ ] All unit tests pass
- [ ] Linting passes with zero warnings
- [ ] Build completes without errors (`npm run build` in each package)
- [ ] Risk engine produces correct scores for all fixture scenarios

---

## Writing a New Test

1. Create test file in the appropriate `tests/` subdirectory
2. Import the module under test and relevant fixtures
3. Use `describe` blocks for the module, `it` blocks for behaviors
4. Test happy path first, then error cases, then edge cases
5. For risk engine: verify both the score value AND the level classification
6. For pollers: verify parsing, trend computation, and cache writes
7. Run in isolation before pushing: `npx vitest run path/to/test.ts`

---

## Known Quirks

| Quirk | Workaround |
|-------|-----------|
| Risk engine has time-dependent logic | Set fixed timestamps in test setup to avoid flaky results |
| Socket.io tests need a running server | Use `beforeAll` to spin up a test server on a random port |
| Agent push tests need both services | Mock both agent and gateway servers |
| LLM tests must cover fallback path | Mock Claude API response AND test the no-API-key deterministic path |
