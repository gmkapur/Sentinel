# Development Guide

## Prerequisites
<!-- What must be installed BEFORE the project can run. -->
- [FILL: e.g., Node.js >= 20]
- [FILL: e.g., Docker Desktop]
- [FILL: e.g., PostgreSQL 16 (or use Docker)]

## First-Time Setup

```bash
# 1. Clone the repository
git clone [FILL: repo URL]
cd sentinel

# 2. Install dependencies
[FILL: e.g., pnpm install]

# 3. Set up environment variables
cp .env.example .env
# [FILL: any manual edits needed]

# 4. Set up the database
[FILL: e.g., pnpm db:migrate]
[FILL: e.g., pnpm db:seed]

# 5. Start the development server
[FILL: e.g., pnpm dev]
```

## Common Development Commands

```bash
# Start dev server (with hot reload)
[FILL: exact command]

# Run all tests
[FILL: exact command]

# Run a single test file
[FILL: exact command, e.g., pnpm vitest run src/auth/auth.test.ts]

# Run tests in watch mode
[FILL: exact command]

# Lint check (no auto-fix)
[FILL: exact command]

# Lint with auto-fix
[FILL: exact command]

# Format code
[FILL: exact command]

# Type check (no emit)
[FILL: exact command]

# Build for production
[FILL: exact command]

# Database migrations
[FILL: exact command to create migration]
[FILL: exact command to run migrations]
[FILL: exact command to rollback]

# Generate types / codegen
[FILL: exact command, if applicable]
```

## Project Structure

```
sentinel/
├── [FILL: e.g., src/]
│   ├── [FILL: e.g., api/]          # [DESCRIBE: role]
│   ├── [FILL: e.g., services/]     # [DESCRIBE: role]
│   ├── [FILL: e.g., models/]       # [DESCRIBE: role]
│   ├── [FILL: e.g., utils/]        # [DESCRIBE: role]
│   └── [FILL: e.g., main.ts]       # [DESCRIBE: entrypoint]
├── [FILL: e.g., tests/]            # [DESCRIBE: test location]
├── [FILL: e.g., migrations/]       # [DESCRIBE: DB migrations]
├── docs/                            # Project documentation (you are here)
├── CLAUDE.md                        # AI agent context file
└── [FILL: e.g., package.json]
```

## Workflow

### Branch Strategy
- **Main branch**: `main` — always deployable
- **Feature branches**: `[FILL: e.g., feature/short-description]`
- **Bug fix branches**: `[FILL: e.g., fix/short-description]`
- **PR required**: [FILL: Yes/No]
- **Review required**: [FILL: Yes/No, how many approvals]

### Before Submitting a PR
```bash
# Run the full check suite
[FILL: e.g., pnpm lint && pnpm typecheck && pnpm test]
```

### Commit Message Format
<!-- Specify your preferred format so agents follow it consistently. -->
[FILL: e.g., Conventional Commits — `type(scope): description`]

Examples:
```
feat(auth): add OAuth2 login flow
fix(api): handle null response from external service
docs(readme): update setup instructions
```

## Debugging

### Common Issues

#### [Issue 1: e.g., "Port already in use"]
```bash
# [FILL: diagnostic command]
# [FILL: fix command]
```

#### [Issue 2: e.g., "Database connection refused"]
```bash
# [FILL: diagnostic and fix]
```

### Debug Tools
- [FILL: e.g., "Use `DEBUG=app:* pnpm dev` for verbose logging"]
- [FILL: e.g., "VSCode launch config in `.vscode/launch.json`"]

## IDE Setup
<!-- Optional but helpful for consistent developer experience. -->
- **Recommended IDE**: [FILL: e.g., VSCode]
- **Required extensions**: [LIST: e.g., ESLint, Prettier, Prisma]
- **Settings**: [FILL: e.g., "Format on save enabled via `.vscode/settings.json`"]
