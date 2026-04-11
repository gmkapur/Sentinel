# Project Overview

## Mission Statement

Orbit Sentinel is a real-time space situational awareness (SSA) dashboard that fuses publicly available space weather and orbital data into a compound risk scoring system with 3D globe visualization. It demonstrates that a credible space situational awareness tool can be built entirely on free APIs in a single sprint, making satellite mission risk analysis accessible to everyone — from university CubeSat teams to space weather enthusiasts.

## Project Description

The system ingests data from NOAA SWPC, NASA DONKI, CelesTrak, and NASA NeoWs to compute a 0–100 risk score using a multi-signal fusion engine with compound synergy rules (e.g., M5+ flare coinciding with LEO satellite on sunlit side). An LLM reasoning layer via Claude Sonnet generates structured GO/CAUTION/NO-GO mission briefs when risk levels change or score deltas exceed thresholds.

The architecture splits into two Node.js microservices: a Gateway service (port 3001) handling client-facing REST and WebSocket (Socket.io) communication plus SGP4 satellite propagation via satellite.js v7 with CelesTrak OMM/JSON data; and an Agent service (port 3002) running cron-scheduled data pollers, the risk fusion engine, and the Claude API integration. The agent pushes fused risk state to the gateway via authenticated HTTP POST to an internal endpoint, which then broadcasts to all connected frontends. The React frontend renders a react-globe.gl 3D visualization with real-time satellite positions updated every 10 seconds and a risk overlay HUD.

Key technical decisions include using JSON/OMM over legacy TLE format for future-proofing against NORAD catalog number exhaustion, in-memory node-cache over Redis for zero-infrastructure dependency, and an agent-push model over a shared message bus for simplicity. The documentation is notably thorough with a GOTCHAS.md capturing non-obvious API behaviors, a detailed CONVENTIONS.md, and explicit architectural rationale for each design decision.

## Problem Statement

- **The problem**: Space weather events (solar flares, geomagnetic storms, radiation belt enhancements) pose real risks to satellite missions, but existing tools are either expensive commercial products, fragmented across dozens of government data portals, or require deep domain expertise to interpret.
- **Who it affects**: Satellite operators, mission planners, space enthusiasts, and educational institutions who need a unified view of space environment threats.
- **Current alternatives**: NASA DONKI and NOAA SWPC provide raw data but no fusion or risk scoring. Commercial SSA platforms (LeoLabs, AGI/Ansys STK, SpaceAware, ExoAnalytic) are expensive or enterprise-gated. CelesTrak provides orbital data but no threat correlation.

### Primary Persona

**University CubeSat Operations Team** — A team of 3–5 students and one faculty advisor operating a 3U CubeSat in LEO (400–600 km). They need to know before a firmware upload or orbit maneuver whether a G3+ geomagnetic storm in the next 6 hours could disrupt their UHF radio link or cause unexpected atmospheric drag. Today they manually check NOAA SWPC, cross-reference with DONKI notifications, and make ad-hoc go/no-go decisions. Orbit Sentinel gives them a single dashboard with a compound risk score and an LLM-generated brief that says "CAUTION: M5.2 flare detected 45 minutes ago, Kp forecast to reach 6 within 3 hours — recommend delaying uplink until next pass."

### Secondary Personas

- **Independent satellite operators** managing constellations of 5–20 small satellites who need automated risk monitoring without commercial SSA subscriptions
- **Space weather enthusiasts** who want a visually engaging real-time display that synthesizes multiple data sources into an understandable format
- **Educational institutions** using the platform as a teaching tool for orbital mechanics, space weather, and systems engineering

## Goals & Non-Goals

### Goals
1. Build a working satellite risk analysis MVP in 6 hours using only free APIs
2. Fuse data from multiple sources (SWPC, DONKI, NeoWs, EONET) into a compound risk score (0–100) with compound synergy rules
3. Provide real-time 3D globe visualization of satellite positions with risk overlays
4. Deliver real-time alerts via WebSocket when risk levels change
5. Generate LLM-powered mission briefs (GO/CAUTION/NO-GO recommendations) using Claude, with deterministic fallback when API key is not configured

### Non-Goals
1. Production-grade infrastructure (no Docker, no database persistence, no Redis)
2. Real conjunction assessment (use SOCRATES reports, not custom CDM analysis)
3. Full Space-Track integration (use CelesTrak as the zero-auth proxy)
4. Comprehensive test coverage (MVP ships without tests)

## Success Metrics
- All data pollers (SWPC, DONKI, NeoWs, EONET) successfully fetch and cache data on their cron schedules
- Risk scoring engine produces accurate 0–100 scores using NOAA's established thresholds
- Agent pushes fused risk state + LLM briefs to gateway every 5 minutes
- 3D globe renders satellite positions updated in real-time via Socket.io
- WebSocket alerts fire within seconds of risk level changes
- Application runs stably with graceful degradation when individual APIs are down
- LLM briefs provide actionable GO/CAUTION/NO-GO recommendations when Claude API key is configured

## Competitive Positioning

| Dimension | Orbit Sentinel | NOAA SWPC Dashboard | NASA DONKI | LeoLabs / AGI STK |
|-----------|---------------|--------------------|-----------|--------------------|
| **Cost** | Free (all APIs) | Free | Free | $$$$ (enterprise) |
| **Data fusion** | Multi-source compound scoring | Single-source display | Event catalog only | Full CDM + fusion |
| **Interpretability** | LLM-generated GO/CAUTION/NO-GO briefs | Raw indices (Kp, flux) | Raw event data | Professional reports |
| **Real-time updates** | WebSocket push, 5-min cycles | Manual refresh | Manual refresh | Real-time |
| **3D visualization** | react-globe.gl with satellite tracks | 2D plots | None | CesiumJS / STK |
| **Setup time** | `npm install` + run | Browser bookmark | Browser bookmark | Weeks (enterprise onboarding) |
| **Target user** | Students, enthusiasts, small operators | Researchers, forecasters | Researchers | Large operators, military |

**Why choose Orbit Sentinel over bookmarking NOAA SWPC?** SWPC displays raw indices — Kp, X-ray flux, proton flux — without synthesizing them into a risk assessment or correlating them with your specific satellite's orbital position. Orbit Sentinel fuses all signals, applies compound synergy rules, and delivers a plain-language GO/CAUTION/NO-GO recommendation via an LLM that considers the combined threat picture.

## V2 Vision (3–6 Month Roadmap)

Beyond the MVP demo, Orbit Sentinel could evolve into a credible open-source SSA platform:

### Phase 1: Robustness (Month 1–2)
- Persistent storage (PostgreSQL for alert history, Redis for shared cache)
- Full test suite (unit + integration + E2E with Playwright)
- Docker Compose deployment for one-command startup
- Historical playback mode: replay past storm events to validate risk scoring

### Phase 2: Intelligence (Month 2–4)
- **Orbital mechanics-aware LLM briefs**: Incorporate satellite altitude, inclination band, sunlit/eclipse status, and mission type into Claude prompts for more targeted recommendations
- **Predictive scoring**: Use DONKI CME propagation models to forecast risk 24–72 hours ahead
- **Per-satellite risk profiles**: Different risk tolerances for different mission types (Earth observation vs. comms vs. science)
- **Space-Track integration**: Full catalog access for conjunction screening

### Phase 3: Ecosystem (Month 4–6)
- **Data source plugin architecture**: Standardized interface for adding new pollers without modifying the risk engine
- **Webhook/API subscriptions**: External systems can subscribe to risk alerts via webhook
- **Embeddable risk widget**: `<iframe>` or npm package for embedding risk scores in third-party dashboards
- **Community risk rules**: User-contributed compound synergy rules with peer review
- **Amateur radio Kp network**: Ingest community magnetometer data for denser coverage

## Key Stakeholders
- **Owner**: Solo developer / sprint team
- **Contributors**: Open-source contributors
- **Users**: University CubeSat teams (primary), independent satellite operators, space weather enthusiasts, educational institutions

## Project Status
- **Phase**: MVP
- **Started**: April 2026
- **Target milestone**: 6-hour functional MVP with live data, risk scoring, LLM mission briefs, and 3D visualization

## Links
- Repository: This repo
- Issue tracker: GitHub Issues
- Design docs: `docs/` directory
- Project evaluation: `docs/PROJECT_EVALUATION.md`
- Production URL: N/A (local development)
