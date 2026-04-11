# Per-Satellite Risk Assessment

## Problem

The risk engine computes a single global 0–100 score. The satellite tracker computes positions for the 3D globe. These two systems are completely disconnected — there's no way to know which satellites are actually threatened by a given space weather event. An X-class flare is dangerous for a LEO CubeSat on the sunlit side, but irrelevant to a satellite in Earth's shadow. A Kp 7 geomagnetic storm causes atmospheric drag on LEO assets but barely affects GEO birds.

## Goal

Compute a per-satellite risk score that accounts for each satellite's orbital regime, current position relative to the sun, and exposure to active threats. Surface this in the UI so operators can see which of their assets are at risk and why.

---

## Satellite Classification

Every tracked satellite gets classified by orbital regime using its altitude from SGP4 propagation:

| Regime | Altitude | Key Vulnerabilities |
|--------|----------|---------------------|
| LEO | < 2,000 km | Atmospheric drag (Kp storms), direct radiation (flares/protons), SAA passage |
| MEO | 2,000–35,786 km | Radiation belt exposure, trapped particle flux during storms |
| GEO | ~35,786 km (±500) | Surface charging, deep dielectric charging during high-speed solar wind |
| HEO/Other | Varies | Radiation belt transit on each orbit |

Classification is derived from the `alt` field already computed by `propagateAll()` — no new data source needed.

---

## Per-Satellite Risk Scoring

Each satellite gets its own risk score (0–100) derived from the global space weather state filtered through its orbital context.

### Scoring Components

#### 1. Solar Flare Exposure

Flares are directional — only satellites on the **sunlit side** of Earth are directly exposed to X-ray and UV flux.

- Compute the **subsolar point** (lat/lng where the sun is directly overhead) using the current UTC time
- For each satellite, compute the **solar zenith angle** — the angle between the satellite's position and the subsolar point
- If zenith angle < 90°: satellite is sunlit → apply full flare score
- If zenith angle 90°–100°: satellite is in the terminator zone → apply 50% flare score
- If zenith angle > 100°: satellite is in Earth's shadow → flare score = 0

Flare score (when exposed):
- X-class → 40
- M5+ → 25
- M1–M4 → 15
- C-class → 5

#### 2. Geomagnetic Storm / Atmospheric Drag (LEO only)

Kp storms cause the upper atmosphere to expand, increasing drag on LEO satellites. This doesn't meaningfully affect MEO/GEO.

- LEO (< 2,000 km): Full geomagnetic score
  - Kp ≥ 7 → 30
  - Kp ≥ 5 → 15
  - Kp ≥ 4 → 5
- Lower LEO (< 500 km): Apply a **1.5x multiplier** — drag effects are strongest here
- MEO/GEO/HEO: Score = 0

#### 3. Radiation / Proton Flux

High-energy protons penetrate spacecraft shielding. LEO satellites passing through the **South Atlantic Anomaly (SAA)** are especially vulnerable. MEO satellites in the radiation belts are also at risk.

- LEO: Apply radiation score with SAA proximity bonus
  - Base: ≥100 pfu → 25, ≥10 pfu → 15, ≥1 pfu → 5
  - If satellite lat is between -50° and -10° AND lng between -90° and 40° (SAA region): +10 bonus
- MEO (especially 10,000–20,000 km — inner radiation belt): Apply full radiation score + 5 bonus
- GEO: Apply 50% radiation score (partial shielding by magnetosphere)

#### 4. Solar Wind / Surface Charging (GEO emphasis)

High-speed solar wind causes differential surface charging on GEO satellites, risking electrostatic discharge.

- GEO: Full solar wind score
  - Speed > 700 km/s → 15 (elevated from global 10 due to GEO vulnerability)
  - Speed > 500 km/s → 5
- LEO/MEO: Score = 0 (magnetosphere shields inner orbits)

#### 5. IMF Bz (Magnetosphere coupling)

Southward Bz opens the magnetosphere to solar wind energy injection. Amplifies all other effects.

- Applied as a **multiplier** rather than additive points:
  - Bz < -10 nT → multiply total score by 1.2
  - Bz < -5 nT → multiply total score by 1.1
  - Bz ≥ -5 nT → no multiplier

#### 6. NEO Proximity

Unchanged from global score. Applied uniformly since NEO risk is not orbit-dependent for threat awareness purposes.

- PHA within 7 days → 5

### Compound Synergy (Per-Satellite)

The same compound rules apply, but now they're gated by orbital context:

- **M5+ flare + Kp ≥ 5 + satellite is LEO and sunlit**: +15 (CME-driven storm confirmation for exposed LEO asset)
- **Kp ≥ 7 + proton flux ≥ 100 + satellite is LEO**: +20 (severe radiation + drag)
- **M5+ flare + satellite is sunlit**: +10 (direct radiation exposure window)

### Final Score

```
rawScore = flareExposure + geomagnetic + radiation + solarWind + neo + compound
adjustedScore = rawScore * bzMultiplier
finalScore = min(adjustedScore, 100)
level = scoreToLevel(finalScore)  // same thresholds: LOW/MODERATE/HIGH/CRITICAL
```

---

## Architecture Changes

### Where Per-Satellite Scoring Runs

**In the gateway, not the agent.**

Rationale:
- The gateway already owns satellite positions (TLE cache + SGP4 propagation every 10s)
- Per-satellite scores change every 10 seconds as satellites move (sunlit → shadow transitions, SAA entry/exit)
- The agent doesn't have satellite position data and shouldn't need it — it focuses on data ingestion and global risk
- The gateway already receives the full space weather state from the agent push, which provides all the inputs needed

### New Module: `packages/gateway/src/satRisk.ts`

Responsible for:
1. Classifying each satellite by orbital regime (LEO/MEO/GEO/HEO) based on altitude
2. Computing the subsolar point for the current time
3. Determining sunlit/shadow status for each satellite
4. Detecting SAA proximity
5. Computing per-satellite risk scores using the latest agent-pushed weather data
6. Returning an enriched satellite position array

### Data Flow

```
Agent pushes global weather state to gateway (existing flow, unchanged)
    ↓
Gateway receives agent push → stores in hot cache (existing)
    ↓
Every 10 seconds (existing satellite broadcast loop):
    1. propagateAll() → get all satellite positions (existing)
    2. NEW: computePerSatelliteRisk(positions, latestWeatherState)
       - For each satellite: classify orbit, check sunlit, check SAA, compute score
    3. Broadcast enriched positions via Socket.io
```

### Type Changes

#### `SatPosition` (packages/shared/types.ts)

Add risk context to the existing type:

```typescript
interface SatPosition {
    id: number;           // NORAD ID (existing)
    name: string;         // (existing)
    lat: number;          // (existing)
    lng: number;          // (existing)
    alt: number;          // km (existing)

    // New fields
    orbitRegime: 'LEO' | 'MEO' | 'GEO' | 'HEO';
    riskScore: number;          // 0–100 per-satellite
    riskLevel: RiskLevel;       // LOW/MODERATE/HIGH/CRITICAL
    isSunlit: boolean;
    isInSAA: boolean;
    threats: string[];          // e.g. ["M5+ flare (sunlit)", "Kp 7 drag"]
}
```

#### New Socket.io event payload

The existing `satellite-positions` event already sends `SatPosition[]`. The enriched fields ride on the same event — no new events needed. Frontend gets risk data for free.

### Gateway Changes

**`packages/gateway/src/index.ts`** — In the 10-second broadcast loop, call `computePerSatelliteRisk()` after `propagateAll()` before emitting.

**`packages/gateway/src/routes.ts`** — The `GET /api/satellites` endpoint returns enriched positions. Add a new endpoint:

- `GET /api/satellites/:noradId/risk` — Returns detailed risk breakdown for a single satellite (useful for a satellite detail panel)

### Frontend Changes

**Globe visualization:**
- Color satellites by their `riskLevel` instead of (or in addition to) altitude
  - LOW → green
  - MODERATE → yellow
  - HIGH → orange
  - CRITICAL → red
- Add a toggle to switch between altitude-based and risk-based coloring

**Satellite detail panel (new component):**
- Click a satellite on the globe to open a detail panel
- Shows: name, NORAD ID, orbit regime, altitude, lat/lng
- Shows: per-satellite risk score, risk level, active threats list
- Shows: sunlit/shadow status, SAA proximity
- Shows: recommended action based on risk level

**Satellite list/filter (new component):**
- Searchable/filterable list of tracked satellites
- Sort by risk score (highest first) to see most threatened assets
- Filter by orbit regime (LEO/MEO/GEO)
- Filter by risk level (show only HIGH/CRITICAL)

**Alert integration:**
- When a satellite transitions from LOW/MODERATE to HIGH/CRITICAL, surface it in the alert panel
- "ISS (ZARYA) entered HIGH risk — M5+ flare exposure on sunlit side"

### LLM Brief Enhancement

The agent's LLM prompt can be enriched with per-satellite context. Since the gateway computes per-satellite risk, the gateway can include a summary of the most-at-risk satellites when forwarding data back to the agent (or the agent can request it).

Add to the LLM prompt:
```
MOST AT-RISK SATELLITES:
  ISS (ZARYA) — CRITICAL (score 82): M5+ flare sunlit exposure + Kp 7 drag
  STARLINK-1234 — HIGH (score 55): LEO SAA passage during proton event
  ...
```

This requires a new internal endpoint or including satellite risk summaries in the agent push response.

---

## Subsolar Point Calculation

The subsolar point is where the sun is directly overhead. It determines which satellites are sunlit.

```typescript
function getSubsolarPoint(date: Date): { lat: number; lng: number } {
    const dayOfYear = getDayOfYear(date);
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60;

    // Solar declination (approximate)
    const declination = -23.44 * Math.cos((360 / 365) * (dayOfYear + 10) * (Math.PI / 180));

    // Subsolar longitude: sun is overhead at solar noon
    // At 0:00 UTC, sun is at 180°E. It moves 15°/hour westward.
    const lng = 180 - (hours * 15);

    return {
        lat: declination,
        lng: lng > 180 ? lng - 360 : lng,
    };
}
```

A satellite is sunlit if the great-circle distance from the satellite to the subsolar point is < ~90° (accounting for Earth's shadow geometry at the satellite's altitude — higher satellites have a slightly wider sunlit zone).

---

## SAA Detection

The South Atlantic Anomaly is a region where the inner Van Allen belt dips closest to Earth's surface (~200 km). Satellites passing through it receive elevated radiation.

Approximate bounding box:
- Latitude: -50° to -10°
- Longitude: -90° to 40°

A more accurate model uses an elliptical region centered around (-26°, -53°) with semi-axes of ~30° lat and ~60° lng. For v1, the bounding box is sufficient.

---

## Watchlist Feature

Operators care about specific satellites, not all 5,000+ in the catalog. Add a **watchlist** so users can track their assets:

### Frontend
- Users can add satellites to a watchlist by clicking "Watch" on the globe or satellite list
- Watchlist is stored in `localStorage` (no backend persistence needed for v1)
- Watchlist satellites get:
  - Highlighted on the globe (larger dot, outline ring)
  - A dedicated panel showing all watchlisted satellites with live risk scores
  - Push notifications (browser Notification API) when a watchlisted satellite enters HIGH/CRITICAL

### Backend
- No backend changes needed for v1 — all watchlist state is client-side
- Future: user accounts + server-side watchlists with email/webhook alerts

---

## Implementation Order

1. **`satRisk.ts` module** — Core per-satellite scoring logic in the gateway
2. **Extend `SatPosition` type** — Add risk fields to the shared type
3. **Wire into broadcast loop** — Enrich positions before Socket.io emit
4. **Globe coloring** — Color satellites by risk level
5. **Satellite detail panel** — Click-to-inspect with risk breakdown
6. **Satellite list + search** — Filterable table sorted by risk
7. **Watchlist** — Client-side satellite tracking with notifications
8. **LLM brief enrichment** — Feed per-satellite context to Claude
9. **Per-satellite alerts** — Notify when watched satellites enter HIGH/CRITICAL

---

## Performance Considerations

- Computing per-satellite risk for ~5,000 satellites every 10 seconds is cheap — it's basic arithmetic per satellite, no API calls
- The subsolar point only needs recalculating once per broadcast cycle (not per satellite)
- SAA check is a simple bounding box test
- The sunlit check is a single great-circle distance calculation (one `acos` call)
- Total added latency to the broadcast loop: < 10ms for 5,000 satellites
- No additional external API calls — all inputs come from the existing agent push data
