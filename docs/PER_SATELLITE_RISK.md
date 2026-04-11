# Per-Satellite Risk Assessment

| Field | Value |
|-------|-------|
| **Type** | Technical Design Document |
| **Status** | Design Complete |
| **Feature** | Orbital context-aware risk scoring per satellite |
| **Service** | Gateway (`:3001`) — runs alongside satellite propagation |
| **Implementation guide** | [`PER_SATELLITE_RISK_IMPLEMENTATION.md`](PER_SATELLITE_RISK_IMPLEMENTATION.md) |

---

## Problem

The risk engine computes a single global 0-100 score. The satellite tracker computes positions for the 3D globe. These two systems are completely disconnected — there's no way to know which satellites are actually threatened by a given space weather event.

An X-class flare is dangerous for a LEO CubeSat on the sunlit side, but irrelevant to a satellite in Earth's shadow. A Kp 7 geomagnetic storm causes atmospheric drag on LEO assets but barely affects GEO satellites.

## Goal

Compute a per-satellite risk score that accounts for each satellite's orbital regime, current position relative to the sun, and exposure to active threats. Surface this in the UI so operators see which of their assets are at risk and why.

---

## Satellite Classification

Every tracked satellite gets classified by orbital regime using its altitude from SGP4 propagation:

| Regime | Altitude | Key Vulnerabilities |
|--------|----------|---------------------|
| **LEO** | < 2,000 km | Atmospheric drag (Kp storms), direct radiation (flares/protons), SAA passage |
| **MEO** | 2,000-35,786 km | Radiation belt exposure, trapped particle flux during storms |
| **GEO** | ~35,786 km (+/- 500) | Surface charging, deep dielectric charging during high-speed solar wind |
| **HEO/Other** | Varies | Radiation belt transit on each orbit |

Classification is derived from the `alt` field already computed by `propagateAll()` — no new data source needed.

---

## Per-Satellite Scoring

Each satellite gets its own 0-100 risk score derived from global space weather data filtered through its orbital context.

### 1. Solar Flare Exposure (Directional)

Flares are directional — only satellites on the **sunlit side** of Earth are directly exposed.

- Compute the **subsolar point** (where the sun is directly overhead) from current UTC time
- For each satellite, compute the **solar zenith angle** (great-circle distance to subsolar point)
- Zenith < 90°: sunlit -> apply full flare score
- Zenith 90°-100°: terminator zone -> apply 50% flare score
- Zenith > 100°: shadow -> flare score = 0

| Condition | Points (when sunlit) |
|-----------|---------------------|
| X-class | 40 |
| M5+ | 25 |
| M1-M4 | 15 |
| C-class | 5 |

### 2. Geomagnetic Storm / Atmospheric Drag (LEO Only)

Kp storms expand the upper atmosphere, increasing drag on LEO satellites.

| Regime | Scoring |
|--------|---------|
| LEO (< 2,000 km) | Full geomagnetic score (Kp >= 7: 30, Kp >= 5: 15, Kp >= 4: 5) |
| Lower LEO (< 500 km) | **1.5x multiplier** — drag effects strongest here |
| MEO / GEO / HEO | Score = 0 |

### 3. Radiation / Proton Flux

High-energy protons penetrate shielding. LEO satellites in the **South Atlantic Anomaly (SAA)** are especially vulnerable.

| Regime | Scoring |
|--------|---------|
| LEO | Base radiation score + **+10 SAA bonus** if in SAA region |
| MEO (10,000-20,000 km) | Full radiation score + **+5 radiation belt** bonus |
| GEO | 50% radiation score (partial magnetosphere shielding) |

SAA bounding box: Lat -50° to -10°, Lng -90° to 40°.

### 4. Solar Wind / Surface Charging (GEO Emphasis)

High-speed solar wind causes differential surface charging on GEO satellites.

| Regime | Scoring |
|--------|---------|
| GEO | Full wind score (>700 km/s: 15, >500 km/s: 5) — elevated due to GEO vulnerability |
| LEO / MEO | Score = 0 (magnetosphere shields inner orbits) |

### 5. IMF Bz (Multiplier)

Southward Bz opens the magnetosphere. Applied as a **multiplier** on the total score:

| Bz Value | Multiplier |
|----------|-----------|
| < -10 nT | 1.2x |
| < -5 nT | 1.1x |
| >= -5 nT | 1.0x (no effect) |

### 6. NEO Proximity

Unchanged from global score. Applied uniformly (not orbit-dependent).

- PHA within 7 days: +5

### Compound Synergy (Per-Satellite)

Same rules, gated by orbital context:

| Combination | Bonus | Gate |
|-------------|-------|------|
| M5+ flare + Kp >= 5 + satellite is LEO and sunlit | +15 | CME-driven storm for exposed LEO |
| Kp >= 7 + proton flux >= 100 + satellite is LEO | +20 | Severe radiation + drag |
| M5+ flare + satellite is sunlit | +10 | Direct radiation exposure |

### Final Score Calculation

```
rawScore = flareExposure + geomagnetic + radiation + solarWind + neo + compound
adjustedScore = rawScore * bzMultiplier
finalScore = min(adjustedScore, 100)
level = scoreToLevel(finalScore)  // LOW/MODERATE/HIGH/CRITICAL
```

---

## Architecture

### Where It Runs: Gateway, Not Agent

**Rationale:**
- The gateway already owns satellite positions (TLE cache + SGP4 every 10s)
- Per-satellite scores change every 10 seconds as satellites move (sunlit/shadow, SAA)
- The agent doesn't have position data and shouldn't need it
- The gateway already receives full weather state from the agent push

### New Module: `packages/gateway/src/satRisk.ts`

1. Classify each satellite by orbital regime (LEO/MEO/GEO/HEO)
2. Compute subsolar point for current time
3. Determine sunlit/shadow status per satellite
4. Detect SAA proximity per satellite
5. Compute per-satellite risk scores using latest agent-pushed weather data
6. Return enriched satellite position array

### Data Flow

```
Agent pushes global weather state → gateway (unchanged)
    ↓
Every 10 seconds (existing satellite broadcast loop):
    1. propagateAll() → satellite positions (existing)
    2. computePerSatelliteRisk(positions, weatherState)  ← NEW
    3. Broadcast enriched positions via Socket.io
```

### Type Extension

```typescript
interface SatPosition {
  id: number;           // existing
  name: string;         // existing
  lat: number;          // existing
  lng: number;          // existing
  alt: number;          // existing

  // New fields
  orbitRegime: 'LEO' | 'MEO' | 'GEO' | 'HEO';
  riskScore: number;          // 0-100 per-satellite
  riskLevel: RiskLevel;       // LOW/MODERATE/HIGH/CRITICAL
  isSunlit: boolean;
  isInSAA: boolean;
  threats: string[];          // e.g. ["M5+ flare (sunlit)", "Kp 7 drag"]
}
```

Enriched fields ride on the existing `satellite-positions` Socket.io event — no new events needed.

---

## Frontend Changes

### Globe Visualization
- Color satellites by `riskLevel` (green/yellow/orange/red)
- Toggle between altitude-based and risk-based coloring

### Satellite Detail Panel (New Component)
- Click satellite -> show name, NORAD ID, orbit regime, altitude, lat/lng
- Show per-satellite risk score, level, active threats
- Show sunlit/shadow status, SAA proximity

### Satellite List (New Component)
- Searchable/filterable list of tracked satellites
- Sort by risk score (highest first)
- Filter by orbit regime and risk level

### Alert Integration
- Surface per-satellite alerts: "ISS (ZARYA) entered HIGH risk — M5+ flare exposure on sunlit side"

---

## Watchlist

Operators track specific satellites via a client-side watchlist:

- Stored in `localStorage` (no backend persistence for v1)
- Highlighted on globe (larger dot, outline ring)
- Dedicated panel with live risk scores
- Browser Notification API alerts on HIGH/CRITICAL transitions

---

## Subsolar Point Calculation

```typescript
function getSubsolarPoint(date: Date): { lat: number; lng: number } {
  const dayOfYear = getDayOfYear(date);
  const hours = date.getUTCHours() + date.getUTCMinutes() / 60;

  // Solar declination (approximate)
  const declination = -23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * (Math.PI / 180));

  // Subsolar longitude: at 0:00 UTC, sun is at 180 deg E. Moves 15 deg/hour westward.
  const lng = 180 - (hours * 15);

  return {
    lat: declination,
    lng: lng > 180 ? lng - 360 : lng,
  };
}
```

---

## Performance

- Per-satellite scoring for ~5,000 satellites every 10 seconds: basic arithmetic, no API calls
- Subsolar point: recalculated once per broadcast cycle (not per satellite)
- SAA check: simple bounding box test
- Sunlit check: one `acos` call per satellite
- **Total added latency to broadcast loop: < 10ms for 5,000 satellites**

---

## Implementation Order

1. `satRisk.ts` module — core scoring logic
2. Extend `SatPosition` type with risk fields
3. Wire into broadcast loop (enrich before Socket.io emit)
4. Globe coloring by risk level
5. Satellite detail panel
6. Satellite list + search/filter
7. Watchlist (client-side with notifications)
8. LLM brief enrichment (per-satellite context to Claude)
9. Per-satellite alerts

See [`PER_SATELLITE_RISK_IMPLEMENTATION.md`](PER_SATELLITE_RISK_IMPLEMENTATION.md) for the step-by-step implementation guide.
