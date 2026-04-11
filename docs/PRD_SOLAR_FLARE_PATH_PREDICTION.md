# PRD: Solar Flare Path Prediction & Satellite Impact Analysis

**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-04-11
**Version:** 1.0

---

## 1. Problem Statement

Orbit Sentinel currently detects solar flares and CMEs _after_ they are observed but does not predict **where** a coronal mass ejection (CME) will travel or **which satellites** will be in the impact zone when it arrives at Earth (or en route). Operators get a global risk score and a generic mission brief, but have no way to see a per-satellite impact probability timeline _before_ the event reaches their asset. This gap can be 15–72 hours — the transit time of a typical CME — during which operators could reposition, safe-mode, or de-orbit if they had actionable predictions.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Predict CME arrival window | Mean absolute error vs. actual SWPC arrival | ≤ 6 hours |
| Identify affected satellites | Recall of satellites that experienced anomalies post-event | ≥ 80% |
| Advance warning time | Median lead time from prediction to CME arrival | ≥ 18 hours |
| User engagement | % of operators who view flare path overlay when active | ≥ 60% |
| False-positive rate | Predictions with HIGH impact that had no measurable effect | ≤ 25% |

---

## 3. User Personas

| Persona | Need |
|---------|------|
| **CubeSat Team Lead** | Know if their specific satellite will be hit and when, so they can command safe-mode |
| **Mission Planner** | Decide whether to delay a maneuver burn scheduled during the predicted impact window |
| **Space Enthusiast** | Visualize the CME cone sweeping through the orbital shell on the 3D globe |
| **Fleet Operator** | Triage which of N satellites need immediate attention vs. which are outside the cone |

---

## 4. Feature Overview

### 4.1 CME Propagation Prediction Agent

A new **prediction agent pipeline** that:

1. Ingests CME detection events from DONKI (already polled in `packages/agent/src/pollers/donki.ts`)
2. Enriches with real-time solar wind context from SWPC (already polled in `packages/agent/src/pollers/swpc.ts`)
3. Fetches CME trajectory analysis from NASA DONKI CME Analysis endpoint (`/DONKI/CMEAnalysis`) — provides half-angle, latitude, longitude, speed, and predicted Earth impact probability
4. Runs an **LLM reasoning agent** (Claude) that fuses CME kinematics, current solar wind conditions, and historical CME-flare associations to produce:
   - Predicted arrival time window (earliest / most-likely / latest)
   - Confidence score (0–1)
   - Affected orbital regimes (LEO sunlit, GEO dusk-side, polar, etc.)
   - Per-satellite impact probability for all tracked satellites
5. Caches predictions in the agent's in-memory store with TTL matching the predicted arrival window
6. Pushes predictions to gateway via `/internal/agent-push` (extending the existing push payload)

### 4.2 Per-Satellite Impact Scoring

Extends the existing per-satellite risk system (`packages/gateway/src/satRisk.ts`) to incorporate flare path predictions:

- **Geometric intersection**: Using the CME cone half-angle and propagation direction from DONKI CME Analysis, compute which satellites' predicted orbital positions (SGP4-propagated forward to the arrival window) fall within the CME cone projection
- **Temporal overlap**: A satellite is "affected" only if it occupies a vulnerable position (sunlit hemisphere, outside magnetospheric shielding) during the predicted arrival window
- **Regime-specific vulnerability**: LEO satellites in the South Atlantic Anomaly (SAA) during impact get elevated scores; GEO satellites on the dayside get elevated scores; MEO satellites in radiation belts get elevated scores

Each satellite receives:
```typescript
interface FlarePathImpact {
  satelliteId: number;           // NORAD catalog number
  cmeId: string;                 // DONKI CME activityID
  impactProbability: number;     // 0.0–1.0
  predictedExposureStart: Date;  // earliest exposure
  predictedExposurePeak: Date;   // peak exposure
  predictedExposureEnd: Date;    // latest exposure
  orbitalContext: {
    regimeAtImpact: 'LEO' | 'MEO' | 'GEO' | 'HEO';
    isSunlitAtImpact: boolean;
    isInSAAAtImpact: boolean;
    solarZenithAtImpact: number;
  };
  recommendedAction: string;     // e.g., "Enter safe-mode by 14:00 UTC"
}
```

### 4.3 LLM Prediction Agent

A Claude-powered agent that goes beyond deterministic geometric calculations:

**Agent role:** Analyze CME characteristics, historical analogs, and current space weather context to refine arrival predictions and generate satellite-specific advisories.

**Input context (injected into Claude prompt):**
- CME parameters: speed, half-angle, direction (lat/lon), type (S/O/C/R)
- Current solar wind: speed, density, IMF Bz
- Recent flare association: class, source location, peak time
- Historical CME catalog: similar events from DONKI (past 2 years) and their actual arrival times
- Satellite positions: top 20 most-exposed satellites with orbital elements
- Existing risk state: current global score and active threats

**Output schema:**
```typescript
interface FlarePathPrediction {
  cmeId: string;
  associatedFlareId: string | null;

  arrivalPrediction: {
    earliest: string;       // ISO timestamp
    mostLikely: string;     // ISO timestamp
    latest: string;         // ISO timestamp
    transitHours: number;   // estimated transit time
    confidence: number;     // 0.0–1.0
  };

  coneGeometry: {
    directionLat: number;   // heliographic latitude (degrees)
    directionLon: number;   // heliographic longitude (degrees)
    halfAngle: number;      // cone half-angle (degrees)
    speed: number;          // km/s at 21.5 solar radii
  };

  earthImpact: {
    willImpactEarth: boolean;
    glancingBlow: boolean;  // partial/edge impact
    impactProbability: number;
    geomagneticStormEstimate: 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'NONE';
  };

  affectedSatellites: FlarePathImpact[];

  agentReasoning: string;    // 2-3 sentence explanation of prediction logic
  analogEvents: string[];    // references to similar historical CMEs
}
```

**Trigger conditions:**
- New CME detected by DONKI poller with speed ≥ 500 km/s
- CME Analysis shows Earth-directed component (half-angle encompasses Earth)
- Existing prediction's confidence drops below 0.3 (data contradicts prior prediction)
- Solar wind conditions change significantly (speed delta > 200 km/s, Bz sign flip)

### 4.4 Globe Visualization

New frontend overlay on the existing 3D globe (`packages/frontend/src/components/globe/GlobeView.tsx`):

- **CME cone projection**: Semi-transparent cone rendered from the Sun's direction toward Earth, colored by severity (yellow → orange → red)
- **Predicted impact zone**: Highlighted band on the globe showing which longitudes/latitudes will be facing the CME at predicted arrival time
- **Satellite highlighting**: Affected satellites glow/pulse with intensity proportional to their impact probability; unaffected satellites remain normal
- **Timeline scrubber**: Horizontal time slider (current time → predicted arrival + 6h) letting users scrub forward to see how satellite positions evolve relative to the CME cone
- **Impact countdown**: Timer showing hours:minutes until predicted CME arrival

### 4.5 Alerts & Notifications

Extends the existing alert system:

- **New alert type:** `FLARE_PATH` with severity derived from impact probability and satellite count
- **Watchlist integration**: Users with watchlisted satellites receive priority alerts if their satellites are in the predicted impact zone
- **Voice alert**: Trigger ElevenLabs voice alert (existing `packages/agent/src/elevenLabsClient.ts`) for HIGH/CRITICAL flare path predictions affecting watchlisted satellites
- **Phone alert**: Trigger Twilio phone alert (existing `packages/agent/src/phoneAlert.ts`) for CRITICAL predictions with ≥ 0.7 impact probability on watchlisted satellites
- **Mission brief update**: LLM brief (`packages/agent/src/llmBrief.ts`) includes flare path prediction context and satellite-specific GO/CAUTION/NO-GO recommendations

---

## 5. Technical Architecture

### 5.1 Data Flow

```
DONKI /CME endpoint                DONKI /CMEAnalysis endpoint
        ↓                                    ↓
   donki.ts poller ←——— new: fetch CME analysis data
        ↓
  In-memory cache (CME + CMEAnalysis data)
        ↓
  ┌─────────────────────────────────────────┐
  │  NEW: Flare Path Prediction Pipeline    │
  │                                         │
  │  1. Geometric CME cone computation      │
  │  2. SGP4 forward-propagation of sats    │
  │  3. Cone-orbit intersection             │
  │  4. Claude agent reasoning layer        │
  │     (refines arrival, adds context)     │
  │  5. Per-satellite impact scoring        │
  └─────────────────────────────────────────┘
        ↓
  FlarePathPrediction cached (TTL = arrival window + 6h)
        ↓
  Push to gateway via /internal/agent-push
        ↓
  Gateway stores prediction → Socket.io broadcast
        ↓
  Frontend renders cone + affected satellites + countdown
```

### 5.2 New & Modified Files

| File | Action | Description |
|------|--------|-------------|
| `packages/agent/src/pollers/donki.ts` | Modify | Add CME Analysis endpoint fetch; enrich CME objects with trajectory data |
| `packages/agent/src/flarePath.ts` | **New** | Core prediction pipeline: geometric cone computation, satellite intersection, agent orchestration |
| `packages/agent/src/flarePathAgent.ts` | **New** | Claude agent prompt engineering and response parsing for flare path predictions |
| `packages/agent/src/dataCache.ts` | Modify | Add `FlarePathPrediction` cache with TTL; add `getActivePredictions()` helper |
| `packages/agent/src/push.ts` | Modify | Include `flarePathPredictions` in push payload |
| `packages/agent/src/riskEngine.ts` | Modify | Factor active flare path predictions into global risk score (new synergy rule) |
| `packages/agent/src/llmBrief.ts` | Modify | Inject flare path prediction context into mission brief prompt |
| `packages/agent/src/alertConfig.ts` | Modify | Add `FLARE_PATH` alert type with severity thresholds |
| `packages/agent/src/index.ts` | Modify | Register flare path evaluation in the main agent loop |
| `packages/gateway/src/agentState.ts` | Modify | Store and serve flare path predictions |
| `packages/gateway/src/routes.ts` | Modify | Add `GET /api/flare-paths` endpoint |
| `packages/gateway/src/satRisk.ts` | Modify | Incorporate flare path impact into per-satellite risk |
| `packages/gateway/src/index.ts` | Modify | Add `flare-path-update` Socket.io event |
| `packages/shared/src/types.ts` | Modify | Add `FlarePathPrediction`, `FlarePathImpact`, `CMEAnalysis` interfaces |
| `packages/frontend/src/components/globe/FlarePathOverlay.tsx` | **New** | CME cone visualization on 3D globe |
| `packages/frontend/src/components/globe/ImpactTimeline.tsx` | **New** | Time scrubber for CME arrival visualization |
| `packages/frontend/src/components/alerts/FlarePathAlert.tsx` | **New** | Flare path alert card component |
| `packages/frontend/src/hooks/useFlarePaths.ts` | **New** | Socket.io hook for flare path prediction data |

### 5.3 New Risk Engine Synergy Rules

| Rule | Condition | Bonus |
|------|-----------|-------|
| CME Earth-directed + M5+ flare | Active flare path prediction with associated M5+ flare | +20 |
| CME arrival imminent + Kp rising | Predicted arrival ≤ 6h AND current Kp ≥ 4 | +15 |
| Multiple CMEs converging | ≥ 2 active Earth-directed CME predictions within 24h | +25 |
| CME + SAA transit | Satellite in SAA during predicted CME arrival | +10 (per-satellite) |

### 5.4 DONKI CME Analysis Endpoint

**Endpoint:** `https://api.nasa.gov/DONKI/CMEAnalysis`

**Parameters:**
- `startDate`, `endDate` — date range (max 30 days)
- `mostAccurateOnly` — boolean, return only the most accurate analysis per CME
- `speed` — minimum speed filter (km/s)
- `halfAngle` — minimum half-angle filter (degrees)
- `catalog` — analysis catalog (default: ALL)

**Response fields used:**
- `latitude`, `longitude` — CME propagation direction
- `halfAngle` — cone half-width in degrees
- `speed` — radial speed at 21.5 solar radii
- `type` — S (slow) / C (common) / O (occasional) / R (rare)
- `isMostAccurate` — boolean
- `associatedCMEID` — links back to the parent CME event
- `time21_5` — timestamp when CME passed 21.5 solar radii (used for transit estimation)

**Rate limits:** Same as other DONKI endpoints. With `DEMO_KEY`: 30 req/hour, 50/day. With registered key: 1,000/hour.

**Polling cadence:** Every 15 minutes (CME analyses update infrequently; align with SWPC cadence).

---

## 6. Agent Prompt Design

### 6.1 System Prompt

```
You are a space weather prediction agent for Orbit Sentinel. Your role is to
analyze coronal mass ejection (CME) data and predict:
1. When the CME will arrive at Earth (earliest, most likely, latest)
2. Which tracked satellites will be in the impact zone
3. What actions satellite operators should take

You have access to:
- CME kinematic parameters (speed, direction, half-angle) from NASA DONKI
- Current solar wind conditions from NOAA SWPC
- Satellite orbital positions (SGP4-propagated)
- Historical CME transit times for similar events

Use the empirical relationship: transit_hours ≈ 0.00464 * distance_km / speed_km_s
adjusted for solar wind drag (deceleration for fast CMEs, acceleration for slow CMEs).

Respond ONLY with valid JSON matching the FlarePathPrediction schema.
Do not include markdown formatting or explanatory text outside the JSON.
```

### 6.2 User Prompt Template

```
Analyze this CME event and predict its path and satellite impact:

## CME Data
- Activity ID: {cmeId}
- Start Time: {startTime}
- Speed: {speed} km/s at 21.5 solar radii
- Direction: Lat {lat}°, Lon {lon}°
- Half-Angle: {halfAngle}°
- Type: {type}
- Time at 21.5 Rs: {time21_5}

## Associated Flare
- Class: {flareClass}
- Peak Time: {flarePeakTime}
- Source Location: {flareSourceLocation}

## Current Space Weather
- Solar Wind Speed: {solarWindSpeed} km/s
- IMF Bz: {bz} nT
- Kp Index: {kpIndex}
- Proton Flux: {protonFlux} pfu

## Satellites in Potential Impact Zone
{top20SatellitesTable}

## Historical Analogs (similar speed/direction CMEs from past 2 years)
{analogEventsTable}

Predict the CME arrival window, affected satellites, and recommended actions.
```

---

## 7. Edge Cases & Gotchas

| Scenario | Handling |
|----------|----------|
| CME Analysis not yet available for a detected CME | Use speed-only estimate from `/DONKI/CME`; mark prediction as `confidence: 0.2`; re-evaluate when analysis appears |
| Multiple CME analyses for same event | Use the one with `isMostAccurate: true`; if none flagged, use the latest |
| CME directed away from Earth | Skip prediction pipeline; log as "non-Earth-directed" in cache for audit |
| Glancing blow (Earth at edge of cone) | Set `glancingBlow: true`; reduce impact probabilities by 50%; note uncertainty in agent reasoning |
| CME-CME interaction (cannibalization) | Flag if two CMEs are within 12h of each other on similar trajectories; increase uncertainty; let Claude agent reason about interaction |
| SGP4 propagation error for far-future positions | Limit forward propagation to 96 hours; degrade confidence for predictions beyond 72h |
| DONKI API returns stale or missing CME Analysis | Fall back to geometric-only prediction without agent reasoning; set `confidence: 0.15` |
| Claude API unavailable | Use deterministic prediction (empirical transit formula + geometric intersection only); set `isLlm: false` |
| Rapid-fire CMEs (≥ 3 in 24h) | Cap concurrent active predictions at 5; prioritize by Earth-impact probability |

---

## 8. Phased Rollout

### Phase 1 — Foundation (Week 1–2)
- Add DONKI CME Analysis poller
- Implement geometric CME cone computation
- Add `FlarePathPrediction` types to shared package
- Forward-propagate satellite positions using SGP4
- Compute geometric cone-orbit intersection
- Cache predictions and push to gateway
- Add `/api/flare-paths` REST endpoint

### Phase 2 — Agent Intelligence (Week 3–4)
- Build Claude prediction agent with prompt engineering
- Add historical analog lookup from cached DONKI data
- Implement arrival time refinement using solar wind drag model
- Generate per-satellite impact scores and recommended actions
- Integrate predictions into existing risk engine (new synergy rules)
- Update mission briefs with flare path context

### Phase 3 — Visualization (Week 5–6)
- Render CME cone overlay on 3D globe
- Add satellite impact highlighting (glow/pulse by probability)
- Build timeline scrubber for arrival visualization
- Add impact countdown timer
- Create flare path alert cards in the alert feed

### Phase 4 — Alerts & Notifications (Week 7–8)
- Add `FLARE_PATH` alert type to the alert system
- Integrate with watchlist: priority alerts for affected watchlisted satellites
- Trigger ElevenLabs voice alerts for HIGH/CRITICAL predictions
- Trigger Twilio phone alerts for CRITICAL predictions on watchlisted satellites
- End-to-end testing with historical CME events

---

## 9. Out of Scope (v1)

- **Solar Energetic Particle (SEP) path modeling** — separate phenomenon from CMEs; add in v2
- **Magnetosphere deformation modeling** — would improve GEO impact prediction but requires MHD simulation
- **Automated satellite commanding** — predictions are advisory only; no direct spacecraft command interface
- **Multi-planet impact prediction** — Earth-centric only; Mars/Lunar predictions are future work
- **Real-time coronagraph image analysis** — would improve early CME detection but requires computer vision pipeline
- **Ensemble model predictions** — v1 uses single Claude agent; ensemble (multiple models + voting) is v2

---

## 10. Dependencies & Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DONKI CME Analysis data is sparse or delayed | Medium | High | Fall back to speed-only estimates; degrade gracefully |
| Claude hallucinations in arrival predictions | Medium | High | Constrain output with JSON schema validation; bound predictions within physically plausible ranges (12–96h transit) |
| SGP4 accuracy degrades for >72h propagation | Low | Medium | Cap forward propagation; add confidence decay |
| NASA API rate limits exceeded during active solar period | Medium | Medium | Implement request queuing; cache aggressively; use registered API key |
| Users misinterpret predictions as certainty | High | High | Always show confidence intervals; use language like "predicted" not "will"; color-code by confidence |

---

## 11. Related Documents

- [Architecture](ARCHITECTURE.md) — system design and data flow
- [API Reference](API_REFERENCE.md) — existing endpoint documentation
- [Gotchas](GOTCHAS.md) — known pitfalls with external APIs
- [Voice Alert System](VOICE_ALERT_SYSTEM.md) — ElevenLabs + Twilio integration
- [Security](SECURITY.md) — inter-service auth and API key handling
