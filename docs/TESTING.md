# Testing Strategy

## Philosophy
<!-- What's your testing approach? What level of coverage do you target? -->
- [FILL: e.g., "Test behavior, not implementation. Favor integration tests over unit tests."]
- **Coverage target**: [FILL: e.g., 80% line coverage, or "no strict target — critical paths must be covered"]

## Test Commands

```bash
# Run all tests
[FILL: exact command]

# Run a single test file
[FILL: exact command with example path]

# Run tests matching a pattern
[FILL: e.g., pnpm vitest run --grep "auth"]

# Run tests in watch mode
[FILL: exact command]

# Run tests with coverage report
[FILL: exact command]

# Run only unit tests
[FILL: exact command, if separated]

# Run only integration tests
[FILL: exact command, if separated]

# Run only e2e tests
[FILL: exact command, if separated]
```

## Test Structure

```
[FILL: your test directory layout]

Example:
tests/
├── unit/                    # Fast, isolated tests
│   ├── services/
│   └── utils/
├── integration/             # Tests with real dependencies
│   ├── api/
│   └── db/
├── e2e/                     # Full end-to-end flows
├── fixtures/                # Shared test data
├── helpers/                 # Test utilities
└── setup.ts                 # Global test setup
```

## Test Categories

### Unit Tests
- **Location**: [FILL: e.g., `tests/unit/` or co-located as `*.test.ts`]
- **Naming**: [FILL: e.g., `[module].test.ts` or `[module].spec.ts`]
- **Mocking strategy**: [FILL: e.g., "Use vitest mocks. Mock external services, never mock internal modules."]
- **When to write**: [FILL: e.g., "For pure business logic and utility functions"]

### Integration Tests
- **Location**: [FILL: e.g., `tests/integration/`]
- **Database**: [FILL: e.g., "Uses test database, reset between suites via transactions"]
- **External services**: [FILL: e.g., "Use MSW for HTTP mocking, testcontainers for databases"]
- **When to write**: [FILL: e.g., "For API endpoints and database queries"]

### End-to-End Tests
- **Location**: [FILL: e.g., `tests/e2e/`]
- **Framework**: [FILL: e.g., Playwright, Cypress]
- **When to write**: [FILL: e.g., "For critical user journeys: signup, checkout, etc."]

## Test Data & Fixtures
- **Factories**: [FILL: e.g., "Use `tests/factories/` with faker for generating test data"]
- **Seeds**: [FILL: e.g., "Run `pnpm db:seed:test` for baseline test data"]
- **Cleanup**: [FILL: e.g., "Each test suite wraps in a transaction that rolls back"]

## What Must Pass Before Merge
<!-- This is critical for agents to know — what's the minimum bar? -->
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Linting passes with zero warnings
- [ ] Type check passes
- [ ] [FILL: any other gates — e.g., coverage threshold, e2e smoke tests]

## Writing a New Test — Checklist
<!-- Step-by-step guide for adding a test. Agents follow this exactly. -->
1. [FILL: e.g., "Create test file next to the source: `foo.test.ts` beside `foo.ts`"]
2. [FILL: e.g., "Import the module under test and relevant fixtures"]
3. [FILL: e.g., "Use `describe` blocks for the module, `it` blocks for behaviors"]
4. [FILL: e.g., "Test the happy path first, then error cases, then edge cases"]
5. [FILL: e.g., "Run the test in isolation before pushing"]

## Known Test Quirks
<!-- Non-obvious testing gotchas — extremely valuable for agents. -->
- [FILL: e.g., "Tests using the database must run sequentially (--no-threads)"]
- [FILL: e.g., "Timer-dependent tests need `vi.useFakeTimers()` — remember to restore"]
- [FILL: e.g., "Snapshot tests auto-update with `--update` flag — review diffs carefully"]
