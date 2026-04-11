# Documentation Index

> This folder contains project documentation optimized for both human developers
> and AI coding agents. Each file serves a specific purpose — keep them focused
> and up to date.

## How to Use This Documentation

### For Humans
Read what you need. Start with [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) for context,
then [DEVELOPMENT.md](DEVELOPMENT.md) to get running locally.

### For AI Agents
The root `CLAUDE.md` and `AGENTS.md` files provide concise context loaded into every
session. Agents read files from this `docs/` folder on-demand when they need deeper
detail. **Do not duplicate content between the root files and these docs.**

## Document Map

| File | Purpose | Update Frequency |
|------|---------|-----------------|
| [PROJECT_OVERVIEW.md](PROJECT_OVERVIEW.md) | Mission, goals, stakeholders | Rarely (when goals change) |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design, components, data flow | When architecture changes |
| [TECH_STACK.md](TECH_STACK.md) | Languages, frameworks, infra, versions | When dependencies change |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Setup, commands, workflow, debugging | When dev workflow changes |
| [TESTING.md](TESTING.md) | Test strategy, commands, structure | When test approach changes |
| [CONVENTIONS.md](CONVENTIONS.md) | Code patterns, naming, organization | When conventions change |
| [GOTCHAS.md](GOTCHAS.md) | Non-obvious pitfalls and gotchas | **Every time someone gets bitten** |
| [API_REFERENCE.md](API_REFERENCE.md) | Endpoints, models, auth, pagination | When API changes |
| [DEPLOYMENT.md](DEPLOYMENT.md) | CI/CD, environments, rollback | When infra changes |
| [SECURITY.md](SECURITY.md) | Auth, permissions, data protection | When security model changes |

## Maintenance Guidelines

1. **Keep root files tiny**: `CLAUDE.md` and `AGENTS.md` should stay under 60 lines.
   They're loaded into every AI session — bloat wastes context tokens.

2. **GOTCHAS.md is the highest-value file**: Update it every time an AI agent or
   developer makes a preventable mistake. Remove entries when the root cause is fixed.

3. **Don't duplicate README content**: The README is for GitHub visitors.
   These docs are for active developers and AI agents.

4. **Only document the non-obvious**: AI agents are excellent at inferring standard
   patterns from code. Focus on what they CAN'T figure out on their own.

5. **Review docs in PRs**: Treat documentation updates like code changes.
   Stale docs are worse than no docs.

6. **Fill in `[FILL]` placeholders**: These templates are designed to be completed
   as the project takes shape. Each `[FILL]` marks a spot that needs real content.
