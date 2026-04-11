# Orbit Sentinel

A real-time space situational awareness (SSA) dashboard that fuses publicly available space weather and orbital data into a compound risk scoring system with 3D globe visualization.

## What It Does

Orbit Sentinel ingests data from NOAA SWPC, NASA DONKI, CelesTrak, and NASA NeoWs to compute a 0–100 risk score using a multi-signal fusion engine with compound synergy rules. An LLM reasoning layer via Claude Sonnet generates structured **GO / CAUTION / NO-GO** mission briefs when risk levels change or score deltas exceed thresholds.

**Key capabilities:**
- Multi-source data fusion with compound synergy scoring (not just additive signal stacking)
- Real-time 3D globe visualization of satellite positions via react-globe.gl
- WebSocket-driven alerts when risk levels change
- LLM-generated mission briefs with threat analysis and maneuver windows
- Graceful degradation when external APIs or the Claude API key are unavailable

## Architecture

Two Node.js microservices + React frontend:

```
Agent (:3002)  ──HTTP POST──►  Gateway (:3001)  ──Socket.io──►  React Frontend
  │                               │
  ├── Cron pollers (SWPC, DONKI,  ├── REST API
  │   NeoWs, EONET)              ├── SGP4 satellite propagation
  ├── Risk fusion engine          └── WebSocket hub
  ├── Claude LLM briefs
  └── Push to gateway
```

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env: add NASA_API_KEY (free at api.nasa.gov)
#            add ANTHROPIC_API_KEY (optional, for LLM briefs)

# Start services (three terminals)
cd packages/agent && npm run dev      # Agent on :3002
cd packages/gateway && npm run dev    # Gateway on :3001
cd packages/frontend && npm run dev   # Frontend on :5173
```

No database, no Docker, no Redis — all data is cached in-memory and fetched from live free APIs.

## Risk Scoring

The risk engine uses NOAA's established thresholds with compound synergy bonuses:

| Level | Score Range | Example Triggers |
|-------|-------------|-----------------|
| LOW | 0–19 | Nominal conditions |
| MODERATE | 20–39 | C-class flare + elevated solar wind |
| HIGH | 40–69 | M5+ flare + Kp ≥ 5 (compound bonus) |
| CRITICAL | 70–100 | X-class flare + G3+ storm + radiation storm |

Compound rules recognize that coincident events are more dangerous than their sum (e.g., M5+ flare AND Kp ≥ 5 triggers a +15 synergy bonus for CME-driven storm confirmation).

## Tech Stack

- **Runtime**: Node.js 20+, TypeScript (strict mode)
- **Backend**: Express, node-cron, node-cache, satellite.js v7, Socket.io
- **Frontend**: React 18, react-globe.gl, Three.js, Socket.io-client
- **LLM**: Claude Sonnet via Anthropic API (optional — deterministic fallback without key)
- **Data sources**: NOAA SWPC, NASA DONKI, NASA NeoWs, NASA EONET, CelesTrak

## Documentation

| Document | Purpose |
|----------|---------|
| [PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md) | Mission, goals, personas, competitive positioning |
| [PROJECT_EVALUATION.md](docs/PROJECT_EVALUATION.md) | 12-dimension project evaluation with scores |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data flow, design decisions |
| [API_REFERENCE.md](docs/API_REFERENCE.md) | Endpoint schemas, request/response examples |
| [DEVELOPMENT.md](docs/DEVELOPMENT.md) | Setup, commands, debugging |
| [GOTCHAS.md](docs/GOTCHAS.md) | Non-obvious API behaviors and pitfalls |
| [CONVENTIONS.md](docs/CONVENTIONS.md) | Code standards and naming |
| [TECH_STACK.md](docs/TECH_STACK.md) | Dependencies and version constraints |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Build sprint plan, CI/CD, demo preparation |
| [TESTING.md](docs/TESTING.md) | Test strategy (post-MVP) |
| [SECURITY.md](docs/SECURITY.md) | Security boundaries and OWASP mitigations |

## Project Scope

Built as a 6-hour sprint MVP demonstrating that a credible SSA tool can be constructed entirely from free public APIs. The compound synergy rules in the risk engine and the LLM-generated structured mission briefs are the primary differentiators from existing tools that either display raw data without synthesis (NOAA SWPC, NASA DONKI) or require expensive enterprise subscriptions (LeoLabs, AGI/Ansys STK).

## License

See repository for license information.
