# Tech Stack

## Runtime & Language
- **Language**: [FILL: e.g., TypeScript 5.x, Python 3.12, Rust 1.75]
- **Runtime**: [FILL: e.g., Node 22, Bun 1.x, Python 3.12, Deno 2.x]
- **Target platforms**: [FILL: e.g., Linux x64, Browser (ES2022), Docker]

## Package Management
- **Package manager**: [FILL: e.g., pnpm, uv, cargo]
- **Lock file**: [FILL: e.g., pnpm-lock.yaml — ALWAYS commit this]
- **Install command**: `[FILL: exact command]`

## Frameworks & Libraries

### Core
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| [FILL] | [FILL] | [FILL] | [FILL: any gotchas] |
| [FILL] | [FILL] | [FILL] | [FILL] |

### Development
| Library | Version | Purpose |
|---------|---------|---------|
| [FILL: e.g., Vitest] | [FILL] | [FILL: testing] |
| [FILL: e.g., ESLint] | [FILL] | [FILL: linting] |
| [FILL: e.g., Prettier] | [FILL] | [FILL: formatting] |

## Infrastructure
- **Database**: [FILL: e.g., PostgreSQL 16, SQLite, MongoDB 7]
- **Cache**: [FILL: e.g., Redis 7, Memcached, none]
- **Message queue**: [FILL: e.g., Redis Streams, RabbitMQ, SQS, none]
- **Search**: [FILL: e.g., Elasticsearch, Meilisearch, none]
- **File storage**: [FILL: e.g., S3, local filesystem, Cloudflare R2]

## DevOps & Tooling
- **CI/CD**: [FILL: e.g., GitHub Actions, GitLab CI]
- **Containerization**: [FILL: e.g., Docker, Podman, none]
- **Orchestration**: [FILL: e.g., Kubernetes, Docker Compose, ECS, none]
- **Monitoring**: [FILL: e.g., Datadog, Prometheus + Grafana, none]
- **Error tracking**: [FILL: e.g., Sentry, Bugsnag, none]

## Version Constraints
<!-- CRITICAL: List any hard version requirements that the agent MUST respect. -->
- [FILL: e.g., "Node >= 20 required for native fetch support"]
- [FILL: e.g., "Python >= 3.11 required for tomllib"]
- [FILL: e.g., "Do NOT upgrade React past 18.x until migration plan is complete"]

## Environment Variables
<!-- List required env vars. DO NOT include actual secret values. -->

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| [FILL: e.g., DATABASE_URL] | Yes | [FILL] | `postgresql://localhost:5432/sentinel` |
| [FILL: e.g., API_KEY] | Yes | [FILL] | `sk-...` |
| [FILL: e.g., NODE_ENV] | No | [FILL] | `development` |
