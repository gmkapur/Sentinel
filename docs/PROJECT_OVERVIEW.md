# Project Overview

## Mission

**Orbit Sentinel** is a real-time space situational awareness (SSA) platform that transforms fragmented public space weather data into actionable satellite mission risk intelligence.

It fuses live feeds from NOAA SWPC, NASA DONKI, CelesTrak, and NASA NeoWs into a compound 0-100 risk score, then uses an LLM reasoning layer (Claude Sonnet) to generate structured **GO / CAUTION / NO-GO** mission briefs. The result is a 3D globe dashboard where operators see their satellites, understand current threats, and receive plain-language recommendations — all from free, publicly available data.

> **North star:** A credible space situational awareness tool built entirely on free APIs, deployable in a single sprint, that makes satellite mission risk analysis accessible to anyone who operates or studies spacecraft.

---

## Why This Matters Now

The space industry is undergoing a fundamental shift. Over 10,000 active satellites orbit Earth today, up from 2,000 five years ago. University CubeSat programs have grown from a handful to over 200 active missions worldwide. Yet the tools available to these operators haven't kept pace:

- **Commercial SSA platforms** (LeoLabs, AGI/Ansys STK, ExoAnalytic, SpaceAware) cost $10,000-100,000+/year and require weeks of enterprise onboarding
- **Government data portals** (NOAA SWPC, NASA DONKI) provide raw data — indices, flux readings, event catalogs — but no synthesis, no risk scoring, and no mission-specific recommendations
- **No free tool exists** that fuses multiple space weather data sources into a compound risk assessment with plain-language mission briefs

This gap means small satellite operators make go/no-go decisions by manually checking 3-5 different government websites, cross-referencing indices they may not fully understand, and relying on institutional knowledge that often doesn't exist in student-run programs.

Orbit Sentinel closes that gap.

---

## Problem Definition

### The Core Problem

Space weather events — solar flares, geomagnetic storms, radiation belt enhancements, coronal mass ejections — pose real, quantifiable risks to satellite missions. An X-class solar flare can degrade radio communications. A Kp 7+ geomagnetic storm causes atmospheric expansion that increases drag on LEO satellites, potentially shortening orbital lifetime by weeks. Proton flux events can corrupt onboard memory and damage solar cells.

**The data to assess these risks is freely available.** NOAA publishes real-time X-ray flux, Kp indices, and proton counts. NASA catalogues every solar flare, CME, and geomagnetic storm. CelesTrak provides orbital elements for every tracked object.

**But no free tool synthesizes this data into actionable intelligence.** Operators must:
1. Navigate to 3-5 separate government data portals
2. Interpret raw scientific indices (what does "Kp = 6" mean for *my* satellite?)
3. Mentally correlate events across sources (did that M5 flare 2 hours ago produce a CME heading toward Earth?)
4. Make a go/no-go decision based on incomplete mental models

This process is error-prone, time-consuming, and inaccessible to non-experts.

### Who It Affects

| Audience | Size | Pain Severity |
|----------|------|---------------|
| University CubeSat teams | 200+ active programs worldwide | High — student teams lack institutional knowledge and domain expertise |
| Independent small-sat operators | ~50 companies managing 5-50 satellites | High — no budget for commercial SSA; manual monitoring doesn't scale |
| Space weather enthusiasts | Tens of thousands globally | Medium — want synthesized, visual data; tired of raw index tables |
| Educational institutions | Hundreds of aerospace/physics programs | Medium — need teaching tools that connect theory to real operations |

### What They Do Today

**Manual multi-tab monitoring:** Open NOAA SWPC in one tab, NASA DONKI in another, CelesTrak in a third. Refresh periodically. Try to mentally fuse the data. Make a gut-call go/no-go decision. No compound risk scoring, no LLM-generated analysis, no real-time alerting.

**Or nothing:** Many small operators simply don't monitor space weather at all because the barrier to entry is too high. They accept the risk and hope for the best.

---

## Personas

### Primary: University CubeSat Operations Team

**Who:** A team of 3-5 undergraduate students and one faculty advisor at a mid-sized university, operating a 3U CubeSat ("TerraScope-1") in a 450 km sun-synchronous LEO orbit. The satellite carries an Earth-observation camera and communicates via UHF ground station on campus.

**Scenario:** It's Tuesday morning. The team has a 15-minute ground station pass at 14:30 UTC — their best window this week to upload a firmware patch that fixes a camera timing bug. The mission lead, a senior aerospace engineering student, needs to decide whether it's safe to proceed.

**Today's workflow:**
1. Opens NOAA SWPC — sees Kp index is 5, but doesn't know if that's dangerous for their orbit
2. Checks NASA DONKI — finds an M5.2 flare was detected 45 minutes ago, but can't tell if a CME was associated
3. Has no way to determine if TerraScope-1 is on the sunlit side during their pass window
4. Asks the faculty advisor, who says "probably fine" based on 15 years of experience
5. Proceeds with the upload, unaware that the M5.2 flare + Kp 5 compound risk significantly increases the probability of UHF link degradation

**With Orbit Sentinel:**
1. Opens the dashboard — sees **CAUTION** status, risk score 52/100
2. Reads the LLM-generated brief: *"M5.2 flare detected 45 minutes ago. Kp forecast to reach 6 within 3 hours. LEO satellites on the sunlit side face elevated radiation exposure. Recommend delaying non-critical uplinks until next ground station pass."*
3. Sees TerraScope-1 highlighted on the 3D globe with a yellow risk indicator
4. Makes an informed decision to delay the firmware upload by one orbit
5. Avoids a potential failed upload that would have required a costly re-attempt

**Why they can't use alternatives:**
- LeoLabs/STK: $10,000+/year — more than their entire mission budget
- NOAA SWPC alone: Raw Kp index, no compound risk, no mission-specific interpretation
- "Just ask the advisor": Single point of failure; doesn't scale; students don't learn

### Secondary Personas

**Independent Constellation Operator** — Managing 12 IoT relay satellites in 550 km LEO. Needs automated risk monitoring across the constellation without a dedicated space weather analyst on staff. Uses Orbit Sentinel's per-satellite risk scoring and WebSocket alerts to know which assets need attention.

**Space Weather Enthusiast** — Follows solar activity as a hobby. Wants a visually engaging, real-time display that synthesizes multiple data sources into an understandable format. The 3D globe with risk-colored satellites and LLM-generated event summaries makes space weather accessible and engaging.

**Aerospace Engineering Professor** — Uses Orbit Sentinel as a teaching tool in an orbital mechanics course. Students see real satellite positions, real space weather data, and real risk assessments — connecting textbook concepts to operational reality.

---

## Goals

### Must Have (MVP)
1. **Multi-source data fusion**: Ingest SWPC, DONKI, NeoWs, and EONET data on automated cron schedules
2. **Compound risk scoring**: Produce a 0-100 score using NOAA's established thresholds with synergy rules that recognize compound threats (e.g., M5+ flare + Kp >= 5 is worse than either alone)
3. **3D globe visualization**: Render satellite positions in real-time on an interactive globe with risk overlays
4. **Real-time alerts**: Push WebSocket notifications to connected clients when risk levels change
5. **LLM mission briefs**: Generate structured GO/CAUTION/NO-GO recommendations via Claude Sonnet, with deterministic fallback when the API key is not configured

### Should Have (Post-MVP)
6. **Per-satellite risk scoring**: Account for each satellite's orbital regime, sunlit/shadow status, and SAA proximity
7. **Voice alert system**: ElevenLabs + Twilio phone calls to operators on HIGH/CRITICAL transitions
8. **Historical playback**: Replay past storm events to validate risk scoring accuracy
9. **Persistent storage**: PostgreSQL for alert history and risk score time series

### Non-Goals (Explicitly Out of Scope)
- **Production-grade infrastructure**: No Docker, no Kubernetes, no Redis for MVP
- **Real conjunction assessment**: No custom CDM analysis — use CelesTrak SOCRATES for collision risk
- **Full Space-Track integration**: Use CelesTrak as the zero-auth proxy; avoid Space-Track account setup
- **Comprehensive test coverage**: MVP ships without tests; testing is a post-MVP priority
- **User authentication**: Read-only public dashboard; no login, no multi-tenancy

---

## Success Metrics

### Functional Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Data poller reliability | All 4 sources fetching on schedule | Console logs confirm successful fetches per cron cycle |
| Risk score accuracy | Scores match NOAA thresholds for known events | Validate against May 2024 G5 storm fixture data |
| End-to-end data latency | < 30 seconds from API fetch to frontend display | Timestamp comparison: agent fetch -> gateway push -> Socket.io emit |
| WebSocket alert delivery | Alerts fire within 5 seconds of risk level change | Client-side timestamp vs. server-side evaluation timestamp |
| LLM brief quality | Briefs contain actionable GO/CAUTION/NO-GO with threat details | Manual review of generated briefs during testing |
| Graceful degradation | System remains functional when 1-2 APIs are down | Kill individual pollers and verify stale cache serving |

### Demo Validation
| Scenario | Expected Output |
|----------|----------------|
| Nominal conditions (quiet sun) | Score 0-15, level LOW, brief says "GO — no significant threats" |
| M5+ flare only | Score 25-40, level MODERATE/HIGH, brief identifies flare risk |
| May 2024 G5 storm (fixture replay) | Score 100 (CRITICAL), brief says "NO-GO" with compound threat analysis |
| Claude API unavailable | Deterministic fallback brief with `confidence: 0.5` |

---

## Competitive Positioning

### Positioning Matrix

| Dimension | Orbit Sentinel | NOAA SWPC | NASA DONKI | LeoLabs | AGI/Ansys STK |
|-----------|---------------|-----------|------------|---------|---------------|
| **Cost** | Free | Free | Free | $$$$$ | $$$$$ |
| **Data fusion** | Multi-source compound scoring with synergy rules | Single-source display | Event catalog only | Full CDM + fusion | Full CDM + fusion |
| **Risk interpretation** | LLM-generated GO/CAUTION/NO-GO briefs | Raw indices (Kp, flux) | Raw event data | Professional analyst reports | Professional analyst reports |
| **Real-time updates** | WebSocket push, 5-min cycles | Manual browser refresh | Manual browser refresh | Real-time | Real-time |
| **3D visualization** | Interactive globe with risk-colored satellites | 2D time-series plots | None | CesiumJS | CesiumJS / STK |
| **Setup time** | `npm install` + 3 terminals | Browser bookmark | Browser bookmark | Weeks (enterprise) | Weeks + training |
| **Compound threat detection** | Synergy rules for multi-factor events | N/A | N/A | Full correlation | Full correlation |

### Why Not Just Bookmark NOAA SWPC?

NOAA SWPC displays raw indices — Kp, X-ray flux, proton flux — as separate time-series plots. A user must: (1) understand what each index means, (2) know the thresholds that matter for their satellite's orbital regime, (3) mentally correlate events across indices, and (4) determine if compound effects amplify the risk.

Orbit Sentinel does all of this automatically: fuses all signals, applies compound synergy rules grounded in NOAA's classification scales, and delivers a plain-language mission brief that considers the combined threat picture. The LLM layer transforms raw data into *decisions*.

---

## Technical Innovation: Compound Synergy Scoring

The compound synergy scoring model is the core intellectual contribution. It encodes domain knowledge typically locked inside the heads of experienced space weather forecasters.

### Base Scores (Grounded in NOAA Scales)

| Signal | Condition | Points | NOAA Reference |
|--------|-----------|--------|----------------|
| Solar flare | X-class active | +40 | R4-R5 radio blackout scale |
| Solar flare | M5-M9 | +25 | R2-R3 |
| Solar flare | M1-M4 | +15 | R1-R2 |
| Geomagnetic storm | Kp >= 7 (G3+) | +30 | G3-G5 geomagnetic storm scale |
| Geomagnetic storm | Kp >= 5 (G1+) | +15 | G1-G2 |
| Radiation storm | >= 100 pfu | +25 | S3+ |
| Radiation storm | >= 10 pfu (S1) | +15 | S1-S2 |
| Solar wind | Speed > 700 km/s | +10 | High-speed stream correlation |
| IMF Bz | < -10 nT (southward) | +10 | Magnetosphere coupling threshold |
| NEO | PHA within 7 days | +5 | NASA CNEOS close approach data |

### Synergy Rules (Novel Contribution)

| Combination | Bonus | Physical Rationale |
|-------------|-------|--------------------|
| M5+ flare AND Kp >= 5 | +15 | The flare's associated CME has arrived and is compressing the magnetosphere — confirmed CME-driven storm |
| Kp >= 7 AND proton flux >= 100 pfu | +20 | Severe radiation environment coinciding with atmospheric drag — LEO satellites face simultaneous radiation damage and orbital decay |
| M5+ flare active | +10 | Direct X-ray and UV radiation exposure window for sunlit LEO assets |

### Score-to-Level Mapping

| Level | Score Range | Operational Meaning |
|-------|-------------|---------------------|
| **LOW** | 0-19 | Nominal. All mission activities cleared. |
| **MODERATE** | 20-39 | Elevated activity. Proceed with awareness. Monitor for escalation. |
| **HIGH** | 40-69 | Significant threat. Delay non-critical operations. Review sensitive assets. |
| **CRITICAL** | 70-100 | Severe compound threat. NO-GO for all non-emergency operations. |

---

## Roadmap

### Phase 0: MVP Sprint (Current)
**Timeline:** 6-hour build sprint
**Deliverable:** Functional dashboard with live data, compound risk scoring, LLM mission briefs, and 3D globe visualization using only free APIs

### Phase 1: Robustness (Month 1-2)
- Persistent storage: PostgreSQL for alert history and risk score time series
- Full test suite: Unit + integration + E2E with Playwright
- Docker Compose: One-command deployment
- Historical playback: Replay past storm events (May 2024 G5 storm) to validate scoring
- Per-satellite risk scoring: Orbital regime-aware, sunlit/shadow, SAA proximity

### Phase 2: Intelligence (Month 2-4)
- **Orbital mechanics-aware LLM briefs**: Satellite altitude, inclination band, sunlit/eclipse status, and mission type injected into Claude prompts
- **Predictive scoring**: DONKI CME propagation models for 24-72 hour risk forecasting
- **Per-satellite risk profiles**: Different risk tolerances for different mission types
- **Voice alert system**: ElevenLabs + Twilio phone calls for HIGH/CRITICAL transitions
- **Space-Track integration**: Full catalog access for conjunction screening

### Phase 3: Ecosystem (Month 4-6)
- **Data source plugin architecture**: Standardized `DataSourcePoller` interface for new pollers
- **Webhook/API subscriptions**: External systems subscribe to risk alerts via configurable webhooks
- **Embeddable risk widget**: npm package or `<iframe>` embed for third-party dashboards
- **Community risk rules**: User-contributed compound synergy rules with peer review
- **Amateur radio Kp network**: Ingest community magnetometer data for denser coverage
- **Open API**: Public REST API with API key authentication for programmatic access

---

## Stakeholders

| Role | Description | Responsibilities |
|------|-------------|-----------------|
| **Project Owner** | Solo developer / sprint team lead | Architecture decisions, risk engine design, LLM integration |
| **Contributors** | Open-source community | Bug fixes, new data source pollers, frontend enhancements |
| **Primary Users** | University CubeSat teams | Daily operational use, feedback on risk scoring accuracy |
| **Secondary Users** | Independent operators, enthusiasts, educators | Feature requests, validation of compound scoring model |

---

## Project Status

| Field | Value |
|-------|-------|
| **Phase** | MVP (6-hour sprint) |
| **Started** | April 2026 |
| **Milestone** | Functional MVP with live data, compound risk scoring, LLM briefs, 3D visualization |
| **Repository** | This repo |
| **Documentation** | `docs/` directory |
| **Evaluation** | [`PROJECT_EVALUATION.md`](PROJECT_EVALUATION.md) |
