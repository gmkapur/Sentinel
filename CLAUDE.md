# Sentinel

## What This Is
<!-- 2-3 sentences: What the project does, who it's for, the core problem it solves. -->
Sentinel is [DESCRIBE: what this project does and who it serves].

## Commands
```bash
# Install dependencies
# [FILL: e.g., npm install, pip install -r requirements.txt, cargo build]

# Start development server
# [FILL: e.g., npm run dev, python manage.py runserver]

# Production build
# [FILL: e.g., npm run build, cargo build --release]

# Run all tests
# [FILL: e.g., npm test, pytest, cargo test]

# Lint / format check
# [FILL: e.g., npm run lint, ruff check ., cargo clippy]
```

## How It Runs
<!-- Brief architecture: entrypoint → key modules → data flow. Use file:line pointers. -->
- **Entrypoint**: `[FILL: e.g., src/main.ts, app/main.py]`
- **Core flow**: [DESCRIBE: request lifecycle or main execution path]
- **Key modules**: [LIST: the 3-5 most important directories/files]

## Things That Will Bite You
<!-- Non-obvious gotchas that an AI agent cannot infer from reading the code. -->
- [FILL: e.g., "Auth tokens refresh silently — never cache them beyond a single request"]
- [FILL: e.g., "The ORM uses soft deletes — always filter by is_active=True"]
- [FILL: counterintuitive pattern + WHY it exists]

## Code Conventions
<!-- ONLY conventions that deviate from framework/language defaults. -->
- Runtime: [FILL: e.g., Bun not Node, uv not pip]
- [FILL: any non-standard patterns the agent must follow]

## Detailed Docs
- Project mission & goals: `docs/PROJECT_OVERVIEW.md`
- System architecture: `docs/ARCHITECTURE.md`
- Tech stack & dependencies: `docs/TECH_STACK.md`
- Development setup: `docs/DEVELOPMENT.md`
- Testing strategy: `docs/TESTING.md`
- Code conventions: `docs/CONVENTIONS.md`
- Non-obvious gotchas: `docs/GOTCHAS.md`
- API reference: `docs/API_REFERENCE.md`
- Deployment & CI/CD: `docs/DEPLOYMENT.md`
- Security boundaries: `docs/SECURITY.md`
