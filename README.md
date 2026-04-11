# Orbit Sentinel

> Real-time space situational awareness powered by free public APIs, compound risk scoring, and LLM-generated mission briefs.

Orbit Sentinel fuses data from NOAA SWPC, NASA DONKI, CelesTrak, and NASA NeoWs into a 0-100 risk score using a multi-signal fusion engine with compound synergy rules. An LLM reasoning layer (Claude Sonnet) generates structured **GO / CAUTION / NO-GO** mission briefs when risk levels change. A 3D globe dashboard renders satellite positions in real-time with risk overlays.

---

## Key Capabilities

- **Multi-source data fusion** with compound synergy scoring (not just additive signal stacking)
- **Real-time 3D globe** visualization of satellite positions via react-globe.gl
- **WebSocket-driven alerts** when risk levels change
- **LLM-generated mission briefs** with threat analysis and maneuver recommendations
- **Graceful degradation** when external APIs or the Claude API key are unavailable

## Architecture

```
Agent (:3002)  ──POST──►  Gateway (:3001)  ──Socket.io──►  React Frontend
  │                           │
  ├── Cron pollers            ├── REST API (/api/*)
  │   (SWPC, DONKI,          ├── SGP4 satellite propagation
  │    NeoWs, EONET)         └── WebSocket hub
  ├── Risk fusion engine
  ├── Claude LLM briefs
  └── Push to gateway
```

## Quick Start

```bash
# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env: add NASA_API_KEY (free at api.nasa.gov)
#            add ANTHROPIC_API_KEY (optional, for LLM briefs)

# Start services (three terminals)
cd packages/agent && npm run dev      # Agent on :3002
cd packages/gateway && npm run dev    # Gateway on :3001
cd packages/frontend && npm run dev   # Frontend on :5173
```

No database, no Docker, no Redis — all data is cached in-memory from live free APIs.

## Risk Scoring

The risk engine uses NOAA's established thresholds with compound synergy bonuses:

| Level | Score | Example Triggers |
|-------|-------|-----------------|
| **LOW** | 0-19 | Nominal conditions |
| **MODERATE** | 20-39 | C-class flare + elevated solar wind |
| **HIGH** | 40-69 | M5+ flare + Kp >= 5 (compound synergy bonus) |
| **CRITICAL** | 70-100 | X-class flare + G3+ storm + radiation storm |

Compound synergy rules recognize that coincident events are more dangerous than their sum — e.g., M5+ flare AND Kp >= 5 triggers a +15 bonus for CME-driven storm confirmation.

## Tech Stack

| Layer | Technologies |
|-------|-------------|
| **Runtime** | Node.js 20+, TypeScript (strict mode) |
| **Backend** | Express, node-cron, node-cache, satellite.js, Socket.io |
| **Frontend** | React 18, react-globe.gl, Three.js, Socket.io-client |
| **LLM** | Claude Sonnet via Anthropic SDK (optional — deterministic fallback) |
| **Data sources** | NOAA SWPC, NASA DONKI, NASA NeoWs, NASA EONET, CelesTrak |

## Documentation

### Core

| Document | Purpose |
|----------|---------|
| [PROJECT_OVERVIEW](docs/PROJECT_OVERVIEW.md) | Mission, vision, personas, competitive positioning, roadmap |
| [PROJECT_EVALUATION](docs/PROJECT_EVALUATION.md) | 12-dimension self-assessment with scores and evidence |
| [ARCHITECTURE](docs/ARCHITECTURE.md) | System design, data flow, design decisions, scaling |

### Technical References

| Document | Purpose |
|----------|---------|
| [API_REFERENCE](docs/API_REFERENCE.md) | Endpoint schemas, data models, Socket.io events |
| [TECH_STACK](docs/TECH_STACK.md) | Dependencies, versions, infrastructure decisions |
| [CONVENTIONS](docs/CONVENTIONS.md) | Code patterns, naming, TypeScript rules |
| [GOTCHAS](docs/GOTCHAS.md) | Non-obvious API behaviors and pitfalls |

### Operations

| Document | Purpose |
|----------|---------|
| [DEVELOPMENT](docs/DEVELOPMENT.md) | Setup, commands, debugging |
| [DEPLOYMENT](docs/DEPLOYMENT.md) | Sprint plan, CI/CD, demo preparation |
| [TESTING](docs/TESTING.md) | Test strategy and structure |
| [SECURITY](docs/SECURITY.md) | Auth boundaries, OWASP mitigations |

### Feature Design

| Document | Purpose |
|----------|---------|
| [VOICE_ALERT_SYSTEM](docs/VOICE_ALERT_SYSTEM.md) | ElevenLabs + Twilio phone call alerts |
| [PER_SATELLITE_RISK](docs/PER_SATELLITE_RISK.md) | Orbital context-aware per-satellite risk scoring |

## Project Scope

Built as a 6-hour sprint MVP demonstrating that a credible SSA tool can be constructed from free public APIs. The compound synergy rules and LLM-generated structured mission briefs are the primary differentiators from tools that either display raw data without synthesis (NOAA SWPC, NASA DONKI) or require expensive enterprise subscriptions (LeoLabs, AGI/Ansys STK).
