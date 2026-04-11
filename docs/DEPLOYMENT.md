# Deployment & CI/CD

## Environments

| Environment | URL | Branch | Auto-deploy? | Purpose |
|-------------|-----|--------|-------------- |---------|
| Development | [FILL: e.g., `localhost:3000`] | — | — | Local dev |
| Staging | [FILL: e.g., `staging.sentinel.io`] | [FILL: e.g., `main`] | [FILL] | QA & testing |
| Production | [FILL: e.g., `sentinel.io`] | [FILL: e.g., tagged releases] | [FILL] | Live users |

## CI Pipeline

### Pipeline Steps
<!-- What happens on every push / PR? -->
```
[FILL: describe your CI pipeline]

Example:
1. Install dependencies (cached)
2. Lint check
3. Type check
4. Unit tests
5. Integration tests (with test database)
6. Build
7. (on main) Deploy to staging
8. (on tag) Deploy to production
```

### CI Configuration
- **Platform**: [FILL: e.g., GitHub Actions]
- **Config location**: [FILL: e.g., `.github/workflows/ci.yml`]
- **Required checks for merge**: [LIST: which checks must pass]

### CI Gotchas
- [FILL: e.g., "CI uses Node 20 — don't use Node 22 features"]
- [FILL: e.g., "Integration tests need `services: postgres` in the workflow"]
- [FILL: e.g., "Cache key includes lockfile hash — update the cache if dependencies change"]

## Deployment Process

### Staging
```bash
# [FILL: exact steps to deploy to staging]
# e.g., "Merging to main auto-deploys to staging via GitHub Actions"
```

### Production
```bash
# [FILL: exact steps to deploy to production]
# e.g.:
git tag v1.2.3
git push origin v1.2.3
# GitHub Actions builds, tests, and deploys the tagged release
```

### Rollback
```bash
# [FILL: how to rollback a bad deploy]
# e.g., "Redeploy previous Docker image tag via `./scripts/rollback.sh v1.2.2`"
```

## Infrastructure

### Hosting
- **Provider**: [FILL: e.g., AWS, GCP, Vercel, Railway, Fly.io]
- **Compute**: [FILL: e.g., ECS Fargate, Lambda, EC2, Kubernetes]
- **Region**: [FILL: e.g., us-east-1]

### Database
- **Host**: [FILL: e.g., RDS PostgreSQL, PlanetScale, Supabase]
- **Backups**: [FILL: e.g., "Daily automated snapshots, 30-day retention"]
- **Migration on deploy**: [FILL: e.g., "Migrations run automatically as part of deploy"]

### DNS & CDN
- **DNS provider**: [FILL: e.g., Cloudflare, Route53]
- **CDN**: [FILL: e.g., Cloudflare, CloudFront]
- **SSL**: [FILL: e.g., auto-provisioned via Let's Encrypt]

## Monitoring & Alerting

### Health Checks
- **Endpoint**: [FILL: e.g., `GET /health`]
- **What it checks**: [FILL: e.g., "DB connectivity, Redis connectivity, disk space"]

### Alerts
- [FILL: e.g., "PagerDuty fires if error rate > 5% for 5 minutes"]
- [FILL: e.g., "Slack alert if response time p95 > 500ms"]

### Logs
- **Location**: [FILL: e.g., CloudWatch, Datadog, stdout → collected by Fluentd]
- **Format**: [FILL: e.g., structured JSON logs]
- **How to access**: [FILL: e.g., `aws logs tail /ecs/sentinel --follow`]

## Secrets Management
- **Tool**: [FILL: e.g., AWS Secrets Manager, Vault, GitHub Secrets, .env files]
- **Rotation policy**: [FILL: e.g., "API keys rotated quarterly"]
- **Who has access**: [FILL: e.g., "Only CI and production infra — never stored locally"]
