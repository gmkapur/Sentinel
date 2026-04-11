# Documentation Index

## Reading Paths

### New to the Project?
Start here to understand what Orbit Sentinel is and how it works:
1. [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) — Mission, problem definition, personas, and competitive positioning
2. [`ARCHITECTURE.md`](ARCHITECTURE.md) — System design, data flow, and design decisions
3. [`DEVELOPMENT.md`](DEVELOPMENT.md) — Setup instructions and development workflow

### Setting Up for Development?
1. [`DEVELOPMENT.md`](DEVELOPMENT.md) — Prerequisites, first-time setup, common commands
2. [`TECH_STACK.md`](TECH_STACK.md) — Dependencies, versions, and environment variables
3. [`CONVENTIONS.md`](CONVENTIONS.md) — Code patterns, naming, and organization rules
4. [`GOTCHAS.md`](GOTCHAS.md) — Non-obvious pitfalls that will save you hours of debugging

### Building a Feature?
1. [`ARCHITECTURE.md`](ARCHITECTURE.md) — Understand the system before modifying it
2. [`API_REFERENCE.md`](API_REFERENCE.md) — Endpoint schemas, data models, Socket.io events
3. [`CONVENTIONS.md`](CONVENTIONS.md) — Follow existing patterns
4. [`TESTING.md`](TESTING.md) — Test strategy and where to add tests

### Evaluating the Project?
1. [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) — Vision, problem definition, roadmap
2. [`PROJECT_EVALUATION.md`](PROJECT_EVALUATION.md) — 12-dimension evaluation with scores and evidence
3. [`ARCHITECTURE.md`](ARCHITECTURE.md) — Technical depth and design decisions

### Preparing for Demo?
1. [`DEPLOYMENT.md`](DEPLOYMENT.md) — Sprint plan, demo-day risk checklist, pre-demo verification
2. [`GOTCHAS.md`](GOTCHAS.md) — Known failure modes and mitigations

---

## Document Map

### Core Documents

| Document | Purpose | Audience |
|----------|---------|----------|
| [`PROJECT_OVERVIEW.md`](PROJECT_OVERVIEW.md) | Mission, vision, problem definition, personas, competitive positioning, roadmap | Everyone |
| [`PROJECT_EVALUATION.md`](PROJECT_EVALUATION.md) | 12-dimension self-assessment with scores, evidence, and action items | Evaluators, project leads |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | System design, components, data flow, design decisions, scaling | Developers, architects |

### Technical References

| Document | Purpose | Audience |
|----------|---------|----------|
| [`API_REFERENCE.md`](API_REFERENCE.md) | Endpoint schemas, request/response examples, data models, Socket.io events | Frontend/backend developers |
| [`TECH_STACK.md`](TECH_STACK.md) | Dependencies, versions, infrastructure decisions, environment variables | Developers, DevOps |
| [`CONVENTIONS.md`](CONVENTIONS.md) | Code patterns, naming, organization, TypeScript conventions | Contributors |
| [`GOTCHAS.md`](GOTCHAS.md) | Non-obvious API behaviors, build quirks, historical decisions | Everyone (highest-value for debugging) |

### Operations

| Document | Purpose | Audience |
|----------|---------|----------|
| [`DEVELOPMENT.md`](DEVELOPMENT.md) | Setup, commands, debugging, IDE configuration | Developers |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Sprint plan, CI/CD, demo preparation, monitoring | DevOps, project leads |
| [`TESTING.md`](TESTING.md) | Test strategy, structure, commands, fixtures | Developers |
| [`SECURITY.md`](SECURITY.md) | Auth boundaries, data protection, OWASP mitigations, secrets management | Developers, security reviewers |

### Feature Design Documents

| Document | Purpose | Status |
|----------|---------|--------|
| [`VOICE_ALERT_SYSTEM.md`](VOICE_ALERT_SYSTEM.md) | ElevenLabs + Twilio phone call alerts PRD | Design complete |
| [`PER_SATELLITE_RISK.md`](PER_SATELLITE_RISK.md) | Per-satellite risk scoring design (orbital context-aware) | Design complete |
| [`PER_SATELLITE_RISK_IMPLEMENTATION.md`](PER_SATELLITE_RISK_IMPLEMENTATION.md) | Step-by-step implementation guide for per-satellite risk | Ready for implementation |

---

## Maintenance Guidelines

1. **Keep root files concise**: `CLAUDE.md` should stay under 80 lines — it's loaded into every AI session
2. **GOTCHAS.md is the highest-value file**: Update it every time anyone makes a preventable mistake. Remove entries when root causes are fixed
3. **Don't duplicate across docs**: Each fact should live in exactly one document. Cross-reference with links
4. **Document the non-obvious**: AI agents infer standard patterns from code. Focus on what they can't figure out alone
5. **Update docs with code changes**: Treat documentation drift like a bug
