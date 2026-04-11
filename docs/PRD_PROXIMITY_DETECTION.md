# PRD: Proximity Detection — Conjunction & NEO Awareness

**Status:** Draft
**Author:** Auto-generated
**Date:** 2026-04-11
**Version:** 1.0

---

## 1. Problem Statement

Orbit Sentinel tracks ~1,000 satellites via SGP4 propagation and scores per-satellite risk from space weather — but two critical classes of orbital risk are invisible today:

**No collision/conjunction awareness.** The gateway propagates satellite positions every 10 seconds but never computes pairwise distances. Operators cannot see when two tracked objects are on converging trajectories. For university CubeSat teams, this is arguably the most operationally relevant risk factor — a conjunction warning can trigger an avoidance maneuver request, and the 15-72 hour lead time that early detection provides can be the difference between a safe maneuver and a lost mission.

**NEO scoring is a flat +5 that ignores geometry.** `scoreNeo(hasPHA: boolean)` in `packages/gateway/src/satRisk.ts` applies an identical 5-point penalty to every satellite whenever any PHA exists in the 7-day window, regardless of whether the NEO passes through that satellite's orbital shell. A NEO with a 50,000 km miss distance is treated identically for a LEO satellite at 400 km and a GEO satellite at 35,786 km. This undermines trust in the risk model's granularity and provides no actionable per-satellite guidance.

---

## 2. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Detect satellite close approaches | Conjunctions surfaced within a 10s broadcast cycle | 100% of threshold-crossing pairs |
| Reduce false positive noise | Intra-constellation events filtered or deprioritized | < 5% of alerts are intra-constellation |
| Distance-based NEO scoring | NEO score varies by orbital shell proximity | Score delta > 5 between LEO and GEO for same NEO |
| Maintain broadcast performance | Added computation time per 10s cycle | < 10ms |
| User engagement | Operators viewing conjunction data when available | > 50% |

---

## 3. User Personas

| Persona | Need |
|---------|------|
| **CubeSat Team Lead** | Know when their satellite is within 25 km of another object; decide whether to request an avoidance maneuver |
| **Independent Operator** | Distinguish a "close" NEO that passes through their orbital shell from one millions of km away |
| **Space Enthusiast** | Visualize conjunction arcs on the 3D globe; browse a list of close approaches |
| **Mission Planner** | Get LLM briefs that include conjunction warnings and NEO proximity context for actionable decision-making |

---

## 4. Feature 1: Satellite-to-Satellite Conjunction Detection

### 4.1 Architecture

Runs entirely in the **gateway service**. The gateway already owns TLE cache, SGP4 propagation, and per-satellite risk enrichment in its 10-second broadcast loop (`packages/gateway/src/index.ts:86-167`). The agent has no satellite positions and remains unchanged for this feature.

### 4.2 Performance Strategy — Two-Phase Filtering

For N=1,000 sats, naive pairwise = ~500K pairs. Feasible (~2-5ms in JS), but we filter to reduce noise:

**Phase 1 — Altitude-band bucketing (O(N)):**

Only compare satellites within the same or adjacent altitude bands:
- LEO-low: 0–600 km
- LEO-high: 600–2,000 km
- MEO: 2,000–35,286 km
- GEO: 35,286–36,286 km
- HEO: >36,286 km

**Phase 2 — 3D Euclidean distance using ECI vectors:**

`satellite.js` already computes ECI position vectors during propagation (`propagate()` returns `posVel.position` in ECI km). Currently these are immediately converted to geodetic in `packages/gateway/src/satellites.ts:148-173`. We cache the ECI vectors alongside geodetic to compute:
```
distance = sqrt((x1-x2)^2 + (y1-y2)^2 + (z1-z2)^2)
```

Estimated additional cost: ~5-8ms per cycle. Well within the 10-second budget.

### 4.3 Regime-Specific Thresholds

| Regime | Alert Threshold | Rationale |
|--------|----------------|-----------|
| LEO | 25 km | Starlink maintains ~5 km intra-plane spacing; 25 km catches cross-plane approaches without flooding |
| MEO | 50 km | Less dense, larger orbits; GNSS constellations have defined slots |
| GEO | 100 km | Same-slot GEO sats may be < 75 km apart; 100 km is meaningful |
| HEO | 50 km | Low density, moderate threshold |

**Severity tiers based on distance:**

| Severity | Distance | Risk Score Contribution |
|----------|----------|------------------------|
| `CLOSE_APPROACH` | < threshold | +5 |
| `WARNING` | < threshold / 2 | +15 |
| `CRITICAL` | < threshold / 5 | +30 |

### 4.4 Constellation Filtering (False Positive Prevention)

Same-constellation satellites (Starlink-to-Starlink, GPS-to-GPS) are always "close" by design. Use CelesTrak group membership as a constellation proxy:

- Extend `TleRecord` with a `group: string` field, set during `fetchTleGroup()`
- Tag conjunctions as `isIntraConstellation: true` when both sats share the same group
- **Intra-constellation**: reduced severity, excluded from alerts and phone calls
- **Inter-constellation**: full severity, generate alerts

### 4.5 Deduplication

Same pair can remain in conjunction across many 10-second cycles. Rate-limit: max 1 alert per unique pair per 5 minutes. In-memory dedup map keyed by `min(sat1Id,sat2Id):max(sat1Id,sat2Id)`.

---

## 5. Feature 2: Per-Satellite NEO Proximity Scoring

### 5.1 Core Concept

NEO miss distance from NeoWs is Earth-centric. A satellite's distance from Earth's center is `EARTH_RADIUS (6,371 km) + altitude`. If the NEO miss distance falls near a satellite's orbital radius, the NEO trajectory passes through or near that satellite's orbital shell.

**Shell delta** = `|neo.missDistanceKm - (6371 + sat.alt)|`

### 5.2 Scoring Algorithm

```
shellDelta = |missDistanceKm - (EARTH_R + satAltKm)|
margin = regime-specific margin (see table)

shellDelta < margin * 0.1  → passes through shell  → 15-25 pts (PHA: 25, non-PHA: 15)
shellDelta < margin * 0.5  → passes near shell     → 8-15 pts  (PHA: 15, non-PHA: 8)
shellDelta < margin        → awareness zone         → 3-8 pts   (PHA: 8, non-PHA: 3)
PHA && missDistance < 7.5M → within lunar distance  → 2 pts

Multipliers:
  velocity > 20 km/s  → x1.2
  diameter > 500m      → x1.3

Cap at 30 points per satellite.
```

**Regime margins:**

| Regime | Margin (km) | Rationale |
|--------|-------------|-----------|
| LEO | 500 | Compact shell, 200–2,000 km |
| MEO | 2,000 | Broader, radiation belt region |
| GEO | 1,000 | Narrow belt at ~35,786 km |
| HEO | 5,000 | Wide apogee range |

### 5.3 Score Range Change

- **Current**: NEO contributes 0 or 5 (flat binary)
- **New**: NEO contributes 0–30 (distance-based, capped)

### 5.4 Agent-Side Global NEO Score

The agent's `riskEngine.ts` replaces `scoreNeo(hasPHA)` with `scoreNeoGlobal(neos)` — computes worst-case NEO proximity across standard orbital shells (LEO 400 km, MEO 20,000 km, GEO 35,786 km). Preserves the existing minimum +5 for any PHA to avoid a behavioral regression.

---

## 6. Data Model Changes

### 6.1 New Shared Types (`packages/shared/src/types.ts`)

```typescript
export type ConjunctionSeverity = 'CLOSE_APPROACH' | 'WARNING' | 'CRITICAL';

export interface ConjunctionEvent {
    id: string;
    sat1Id: number;
    sat1Name: string;
    sat2Id: number;
    sat2Name: string;
    distanceKm: number;
    severity: ConjunctionSeverity;
    isIntraConstellation: boolean;
    sat1Regime: OrbitRegime;
    sat2Regime: OrbitRegime;
    sat1Position: { lat: number; lng: number; alt: number };
    sat2Position: { lat: number; lng: number; alt: number };
    timestamp: string;
}

export interface NeoProximityDetail {
    neoId: string;
    neoName: string;
    missDistanceKm: number;
    shellDeltaKm: number;
    score: number;
    isPotentiallyHazardous: boolean;
}
```

### 6.2 Extended Existing Types

**SatPosition** — new optional fields:
- `conjunctions?: ConjunctionEvent[]`
- `conjunctionCount?: number`
- `nearestNeo?: { name: string; shellDeltaKm: number; missDistanceKm: number }`

**SatRiskBreakdown.scoring** — add `conjunction: number` field.

### 6.3 TleRecord Extension (`packages/gateway/src/satellites.ts`)

Add `group: string` field. Introduce parallel `PropagatedSat` type carrying ECI vectors for distance computation.

### 6.4 New Prisma Model

```prisma
model ConjunctionEvent {
    id                    String   @id @default(uuid())
    sat1NoradId           Int
    sat1Name              String
    sat2NoradId           Int
    sat2Name              String
    distanceKm            Float
    severity              String
    isIntraConstellation  Boolean
    sat1Regime            String
    sat2Regime            String
    sat1Position          Json
    sat2Position          Json
    timestamp             DateTime @default(now())

    @@index([sat1NoradId, timestamp(sort: Desc)])
    @@index([sat2NoradId, timestamp(sort: Desc)])
    @@index([severity, timestamp(sort: Desc)])
    @@index([timestamp(sort: Desc)])
    @@map("conjunction_events")
}
```

---

## 7. API Changes

### New REST Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/conjunctions` | Active conjunctions. Query: `?severity=`, `?noradId=`, `?limit=` |
| `GET /api/conjunctions/:noradId` | Conjunctions for a specific satellite |
| `GET /api/conjunctions/history` | Historical events from DB. Query: `?since=`, `?severity=`, `?limit=` |
| `GET /internal/active-conjunctions` | Internal endpoint for agent LLM brief enrichment |

### New Socket.io Events

| Event | Frequency | Payload |
|-------|-----------|---------|
| `conjunction-update` | Every 10s (with positions) | All active `ConjunctionEvent[]` |
| `conjunction-alerts` | On new WARNING/CRITICAL detections | New `ConjunctionEvent[]` |

### Modified Endpoints

`GET /api/satellites/:noradId/risk` — response now includes `scoring.conjunction` and distance-based `scoring.neo`.

---

## 8. Risk Scoring Integration

### Per-Satellite Flow (Modified)

```
Current:  flare + geo + rad + wind + neo(flat 5) + compound → raw x bzMult → final
New:      flare + geo + rad + wind + neoProximity(0-30) + conjunction(0-30) + compound → raw x bzMult → final
```

### New Compound Synergy Rule

**Conjunction during geomagnetic storm**: If satellite has WARNING+ conjunction AND Kp >= 5, add +10 compound bonus. Rationale: geomagnetic storms cause atmospheric drag that perturbs LEO orbits, increasing uncertainty in TLE-based conjunction predictions.

---

## 9. Frontend Changes

### Globe Visualization (`GlobeView.tsx`)
- Add `arcsData` prop to `<Globe>` for conjunction lines between close-approach pairs
- Arc color by severity: yellow (CLOSE_APPROACH), orange (WARNING), red (CRITICAL)
- Pulsing animation for CRITICAL arcs
- Toggle to show/hide intra-constellation conjunctions

### Satellite Detail Panel (`SatelliteDetailPanel.tsx`)
- New "Conjunctions" section listing active conjunctions for this satellite
- Updated score breakdown: add `conjunction` bar (max 30), update `neo` bar max from 5 to 30

### Satellite Tooltip (`SatelliteTooltip.tsx`)
- Show conjunction count if any active
- Show nearest NEO distance if NEO score > 0

### New Conjunction List Panel
- Table in side panel: Sat 1, Sat 2, Distance (km), Severity, Time
- Sortable, filterable by severity/regime
- Click to center globe on conjunction pair

### Store Updates (`missionStore.ts`)
- Add `conjunctions: ConjunctionEvent[]` and `setConjunctions`

---

## 10. LLM Brief Integration

### Updated System Prompt
Add guidance: "TLE-based conjunction warnings are proximity alerts, not collision predictions. Recommend monitoring or standby for avoidance maneuvers for WARNING/CRITICAL conjunctions."

### Updated User Prompt
Add sections for top 5 active conjunctions by severity and per-regime NEO proximity worst cases. Agent fetches conjunction data from `GET /internal/active-conjunctions` on the gateway.

---

## 11. Performance Considerations

| Metric | Current | Added Cost | Verdict |
|--------|---------|------------|---------|
| 10s cycle time | ~15ms | +5-8ms | OK |
| Memory | ~50 MB | +~100 KB | OK |
| Socket.io payload | ~200 KB/cycle | +~30 KB | OK (+15%) |
| DB writes/cycle | ~1 | +0-5 | OK |

**Scaling**: At 2,000+ sats, implement 3D spatial hashing. At 10,000+, move to Node.js worker_threads.

---

## 12. Phased Rollout

### Phase 1 — NEO Proximity Scoring (Week 1-2)
Replace flat NEO score with distance-based. Minimal architecture change, high value.

### Phase 2 — Conjunction Detection Engine (Week 3-5)
New gateway module, Prisma model, REST endpoints, Socket.io events.

### Phase 3 — Frontend Visualization (Week 5-7)
Globe arcs, conjunction panel, updated detail panel, store + socket handlers.

### Phase 4 — LLM & Polish (Week 7-8)
LLM prompt updates, compound synergy, phone alerts for CRITICAL conjunctions, e2e testing.

---

## 13. Open Questions & Risks

### Open Questions
1. Should conjunction thresholds be user-configurable via a frontend slider?
2. Should intra-constellation conjunctions be completely hidden or just de-prioritized?
3. Should CRITICAL conjunctions trigger phone calls (currently only global risk level transitions do)?
4. Database retention period for conjunction events — 30 days? 90 days?
5. TLE age: should we display confidence degradation for stale TLEs (>3 days old)?

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| False positive fatigue from dense constellations | High | Medium | Aggressive constellation filtering + severity tiers |
| TLE accuracy limits (SGP4 ~1km LEO) | Medium | High | Label as "TLE-based proximity warnings" with confidence indicator |
| NEO shell comparison is an approximation | Low | Low | Document as approximation; true NEO-sat conjunction needs full ephemeris |
| Breaking change to NEO scoring | Medium | Medium | Release notes + comparison view during rollout |
| Socket.io bandwidth growth (+15%) | Low | Low | Send conjunction deltas; add frontend toggle |

---

## 14. Related Documents

- [Architecture](ARCHITECTURE.md) — system design and data flow
- [API Reference](API_REFERENCE.md) — existing endpoint documentation
- [Gotchas](GOTCHAS.md) — known pitfalls with external APIs
- [Solar Flare Path PRD](PRD_SOLAR_FLARE_PATH_PREDICTION.md) — related CME prediction feature
