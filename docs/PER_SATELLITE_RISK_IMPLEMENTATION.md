# Per-Satellite Risk — Implementation Guide

| Field | Value |
|-------|-------|
| **Type** | Step-by-step implementation plan |
| **Status** | Ready for Implementation |
| **Design doc** | [`PER_SATELLITE_RISK.md`](PER_SATELLITE_RISK.md) |
| **Phases** | 11 phases covering types, scoring, API, frontend, and testing |

This document specifies every file to create or modify, the exact code changes, integration points, and testing approach for per-satellite risk scoring.

---

## Table of Contents

1. [Phase 1: Shared Types](#phase-1-shared-types)
2. [Phase 2: Core Scoring Module](#phase-2-core-scoring-module-satrisktsgatewaynew-file)
3. [Phase 3: Gateway Integration](#phase-3-gateway-integration)
4. [Phase 4: REST API](#phase-4-rest-api)
5. [Phase 5: Frontend Store & Socket](#phase-5-frontend-store--socket)
6. [Phase 6: Globe Visualization](#phase-6-globe-visualization)
7. [Phase 7: Satellite Detail Panel](#phase-7-satellite-detail-panel)
8. [Phase 8: Satellite List & Filter](#phase-8-satellite-list--filter)
9. [Phase 9: Watchlist](#phase-9-watchlist)
10. [Phase 10: LLM Brief Enrichment](#phase-10-llm-brief-enrichment)
11. [Phase 11: Per-Satellite Alerts & Persistence](#phase-11-per-satellite-alerts--persistence)
12. [Testing Strategy](#testing-strategy)
13. [Migration Checklist](#migration-checklist)

---

## Phase 1: Shared Types

**File:** `packages/shared/src/types.ts`

### 1.1 Add `OrbitRegime` type

```typescript
export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';
```

### 1.2 Extend `SatPosition`

Add optional risk fields so the type is backwards-compatible during incremental rollout. Once the gateway enrichment is live, the fields are always populated.

```typescript
export interface SatPosition {
    id: number;           // NORAD catalog number
    name: string;
    lat: number;
    lng: number;
    alt: number;          // km above Earth surface

    // Per-satellite risk (populated by gateway satRisk module)
    orbitRegime?: OrbitRegime;
    riskScore?: number;         // 0–100
    riskLevel?: RiskLevel;      // LOW | MODERATE | HIGH | CRITICAL
    isSunlit?: boolean;
    isInSAA?: boolean;
    threats?: string[];         // human-readable threat descriptions
}
```

### 1.3 Add `SatRiskBreakdown` interface

For the detailed per-satellite endpoint.

```typescript
export interface SatRiskBreakdown {
    satellite: {
        noradId: number;
        name: string;
        orbitRegime: OrbitRegime;
        altitude: number;
        lat: number;
        lng: number;
        isSunlit: boolean;
        isInSAA: boolean;
        solarZenithAngle: number;   // degrees
    };
    scoring: {
        flareExposure: number;
        geomagnetic: number;
        radiation: number;
        solarWind: number;
        neo: number;
        compound: number;
        bzMultiplier: number;
        rawTotal: number;
        finalScore: number;
    };
    level: RiskLevel;
    threats: string[];
    timestamp: string;
}
```

### 1.4 Add `SatRiskSummary` interface

For feeding top-risk satellites into LLM briefs.

```typescript
export interface SatRiskSummary {
    noradId: number;
    name: string;
    orbitRegime: OrbitRegime;
    riskScore: number;
    riskLevel: RiskLevel;
    threats: string[];
}
```

---

## Phase 2: Core Scoring Module — `satRisk.ts` (Gateway, New File)

**File:** `packages/gateway/src/satRisk.ts`

This is the heart of the feature. It's a pure-function module with no side effects, making it trivially testable.

### 2.1 Module Structure

```
satRisk.ts
├── getSubsolarPoint(date)           → { lat, lng }
├── getSolarZenithAngle(satLat, satLng, subsolar)  → degrees
├── classifyOrbit(altKm)             → OrbitRegime
├── isInSAA(lat, lng)                → boolean
├── isSunlit(zenithAngle)            → boolean
├── scoreFlareExposure(xrayClass, zenithAngle)      → { score, threat? }
├── scoreGeomagnetic(kp, regime, altKm)             → { score, threat? }
├── scoreRadiation(protonFlux, regime, lat, lng)    → { score, threat? }
├── scoreSolarWind(windSpeed, regime)               → { score, threat? }
├── scoreNeo(hasPHA)                                → { score, threat? }
├── computeCompoundBonus(xray, kp, protonFlux, regime, isSunlit) → { score, threats[] }
├── getBzMultiplier(bz)              → number
├── computeSingleSatelliteRisk(sat, weather, subsolar, hasPHA) → EnrichedSatPosition
├── computePerSatelliteRisk(positions, weather, neos)           → EnrichedSatPosition[]
└── getTopRiskSatellites(enriched, count)                       → SatRiskSummary[]
```

### 2.2 Subsolar Point Calculation

```typescript
function getDayOfYear(date: Date): number {
    const start = new Date(date.getUTCFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getSubsolarPoint(date: Date): { lat: number; lng: number } {
    const dayOfYear = getDayOfYear(date);
    const hours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600;

    // Solar declination (approximate, ±0.5° accuracy)
    const declination = -23.44 * Math.cos((2 * Math.PI / 365) * (dayOfYear + 10));

    // Subsolar longitude: at 0:00 UTC the sun is at ~180°E, moving 15°/hr westward
    let lng = 180 - hours * 15;
    if (lng < -180) lng += 360;
    if (lng > 180) lng -= 360;

    return { lat: declination, lng };
}
```

### 2.3 Solar Zenith Angle

Uses the spherical law of cosines for angular distance between satellite position and subsolar point.

```typescript
export function getSolarZenithAngle(
    satLat: number, satLng: number,
    subsolar: { lat: number; lng: number }
): number {
    const toRad = Math.PI / 180;
    const lat1 = satLat * toRad;
    const lat2 = subsolar.lat * toRad;
    const dLng = (satLng - subsolar.lng) * toRad;

    const cosAngle = Math.sin(lat1) * Math.sin(lat2) +
                     Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);

    // Clamp to [-1, 1] to avoid NaN from floating-point errors
    return Math.acos(Math.max(-1, Math.min(1, cosAngle))) / toRad;
}
```

### 2.4 Orbit Classification

```typescript
export function classifyOrbit(altKm: number): OrbitRegime {
    if (altKm < 2000) return 'LEO';
    if (altKm < 35286) return 'MEO';    // below GEO belt
    if (altKm <= 36286) return 'GEO';   // 35786 ± 500 km
    return 'HEO';
}
```

### 2.5 SAA Detection

```typescript
export function isInSAA(lat: number, lng: number): boolean {
    return lat >= -50 && lat <= -10 && lng >= -90 && lng <= 40;
}
```

### 2.6 Individual Signal Scorers

Each scorer returns `{ score, threat }` where `threat` is a human-readable string (or `null` if no contribution).

```typescript
interface ScoreResult {
    score: number;
    threat: string | null;
}

export function scoreFlareExposure(xrayClass: string | null, zenithAngle: number): ScoreResult {
    if (!xrayClass) return { score: 0, threat: null };

    let baseScore = 0;
    let label = '';
    const cls = xrayClass.toUpperCase();

    if (cls.startsWith('X')) {
        baseScore = 40; label = 'X-class flare';
    } else if (cls.startsWith('M')) {
        const num = parseFloat(cls.slice(1)) || 1;
        if (num >= 5) { baseScore = 25; label = 'M5+ flare'; }
        else { baseScore = 15; label = `${cls} flare`; }
    } else if (cls.startsWith('C')) {
        baseScore = 5; label = 'C-class flare';
    }

    if (baseScore === 0) return { score: 0, threat: null };

    // Apply sunlit attenuation
    let exposure: number;
    let exposureLabel: string;
    if (zenithAngle < 90) {
        exposure = 1.0;
        exposureLabel = 'sunlit';
    } else if (zenithAngle <= 100) {
        exposure = 0.5;
        exposureLabel = 'terminator';
    } else {
        return { score: 0, threat: null }; // in shadow
    }

    const score = Math.round(baseScore * exposure);
    return { score, threat: `${label} (${exposureLabel})` };
}

export function scoreGeomagnetic(kp: number | null, regime: OrbitRegime, altKm: number): ScoreResult {
    if (kp === null || regime !== 'LEO') return { score: 0, threat: null };

    let base = 0;
    if (kp >= 7) base = 30;
    else if (kp >= 5) base = 15;
    else if (kp >= 4) base = 5;
    else return { score: 0, threat: null };

    // Lower LEO multiplier
    const multiplier = altKm < 500 ? 1.5 : 1.0;
    const score = Math.min(Math.round(base * multiplier), 45); // cap at 45

    const lowLeo = altKm < 500 ? ', low-LEO drag amplified' : '';
    return { score, threat: `Kp ${kp} geomagnetic storm${lowLeo}` };
}

export function scoreRadiation(
    protonFlux: number | null, regime: OrbitRegime,
    lat: number, lng: number
): ScoreResult {
    if (protonFlux === null) return { score: 0, threat: null };

    let base = 0;
    if (protonFlux >= 100) base = 25;
    else if (protonFlux >= 10) base = 15;
    else if (protonFlux >= 1) base = 5;
    else return { score: 0, threat: null };

    const threats: string[] = [];
    let score = 0;

    switch (regime) {
        case 'LEO': {
            score = base;
            const inSAA = isInSAA(lat, lng);
            if (inSAA) {
                score += 10;
                threats.push(`Proton flux ${protonFlux} pfu + SAA passage`);
            } else {
                threats.push(`Proton flux ${protonFlux} pfu`);
            }
            break;
        }
        case 'MEO': {
            score = base;
            // Inner radiation belt bonus for 10,000–20,000 km
            // (altitude is not passed here, but regime is MEO so alt is 2000–35786)
            score += 5;
            threats.push(`Proton flux ${protonFlux} pfu (radiation belt)`);
            break;
        }
        case 'GEO': {
            score = Math.round(base * 0.5);
            threats.push(`Proton flux ${protonFlux} pfu (partial shielding)`);
            break;
        }
        default:
            score = base;
            threats.push(`Proton flux ${protonFlux} pfu`);
    }

    return { score, threat: threats[0] ?? null };
}

export function scoreSolarWind(windSpeed: number | null, regime: OrbitRegime): ScoreResult {
    if (windSpeed === null || regime !== 'GEO') return { score: 0, threat: null };

    if (windSpeed > 700) return { score: 15, threat: `Solar wind ${windSpeed} km/s (GEO surface charging risk)` };
    if (windSpeed > 500) return { score: 5, threat: `Solar wind ${windSpeed} km/s (elevated)` };
    return { score: 0, threat: null };
}

export function scoreNeo(hasPHA: boolean): ScoreResult {
    return hasPHA
        ? { score: 5, threat: 'PHA within 7-day window' }
        : { score: 0, threat: null };
}
```

### 2.7 Compound Synergy

```typescript
export function computeCompoundBonus(
    xrayClass: string | null,
    kp: number | null,
    protonFlux: number | null,
    regime: OrbitRegime,
    sunlit: boolean
): ScoreResult {
    const threats: string[] = [];
    let bonus = 0;

    const isM5Plus = xrayClass !== null && (
        xrayClass.toUpperCase().startsWith('X') ||
        (xrayClass.toUpperCase().startsWith('M') && (parseFloat(xrayClass.slice(1)) || 0) >= 5)
    );
    const kpHigh = (kp ?? 0) >= 5;
    const kpSevere = (kp ?? 0) >= 7;
    const protonHigh = (protonFlux ?? 0) >= 100;

    // Rule 1: M5+ flare + Kp ≥ 5 + LEO + sunlit → +15
    if (isM5Plus && kpHigh && regime === 'LEO' && sunlit) {
        bonus += 15;
        threats.push('CME-driven storm + flare exposure (LEO sunlit)');
    }

    // Rule 2: Kp ≥ 7 + proton ≥ 100 + LEO → +20
    if (kpSevere && protonHigh && regime === 'LEO') {
        bonus += 20;
        threats.push('Severe radiation + atmospheric drag (LEO)');
    }

    // Rule 3: M5+ flare + sunlit → +10
    if (isM5Plus && sunlit) {
        bonus += 10;
        threats.push('Direct radiation exposure window (sunlit)');
    }

    return { score: bonus, threat: threats.length > 0 ? threats.join('; ') : null };
}
```

### 2.8 Bz Multiplier

```typescript
export function getBzMultiplier(bz: number | null): number {
    if (bz === null) return 1.0;
    if (bz < -10) return 1.2;
    if (bz < -5) return 1.1;
    return 1.0;
}
```

### 2.9 Single Satellite Scorer (Orchestrator)

```typescript
export function computeSingleSatelliteRisk(
    sat: SatPosition,
    weather: SpaceWeatherState,
    subsolar: { lat: number; lng: number },
    hasPHA: boolean
): SatPosition {
    const regime = classifyOrbit(sat.alt);
    const zenith = getSolarZenithAngle(sat.lat, sat.lng, subsolar);
    const sunlit = zenith < 100; // includes terminator zone
    const inSAA = regime === 'LEO' && isInSAA(sat.lat, sat.lng);

    const flare = scoreFlareExposure(weather.xrayClass, zenith);
    const geo = scoreGeomagnetic(weather.kpIndex, regime, sat.alt);
    const rad = scoreRadiation(weather.protonFlux, regime, sat.lat, sat.lng);
    const wind = scoreSolarWind(weather.solarWindSpeed, regime);
    const neo = scoreNeo(hasPHA);
    const compound = computeCompoundBonus(
        weather.xrayClass, weather.kpIndex, weather.protonFlux, regime, sunlit
    );

    const rawScore = flare.score + geo.score + rad.score + wind.score + neo.score + compound.score;
    const bzMult = getBzMultiplier(weather.bz);
    const adjusted = Math.round(rawScore * bzMult);
    const finalScore = Math.min(adjusted, 100);

    const level: RiskLevel =
        finalScore >= 70 ? 'CRITICAL' :
        finalScore >= 40 ? 'HIGH' :
        finalScore >= 20 ? 'MODERATE' : 'LOW';

    const threats = [flare, geo, rad, wind, neo, compound]
        .map(r => r.threat)
        .filter((t): t is string => t !== null);

    return {
        ...sat,
        orbitRegime: regime,
        riskScore: finalScore,
        riskLevel: level,
        isSunlit: zenith < 90,
        isInSAA: inSAA,
        threats,
    };
}
```

### 2.10 Batch Scorer (Entry Point)

```typescript
export function computePerSatelliteRisk(
    positions: SatPosition[],
    weather: SpaceWeatherState | null,
    neos: NEOObject[]
): SatPosition[] {
    // If no weather data from agent yet, return positions with default LOW risk
    if (!weather) {
        return positions.map(sat => ({
            ...sat,
            orbitRegime: classifyOrbit(sat.alt),
            riskScore: 0,
            riskLevel: 'LOW' as RiskLevel,
            isSunlit: false,
            isInSAA: false,
            threats: [],
        }));
    }

    const now = new Date();
    const subsolar = getSubsolarPoint(now);
    const hasPHA = neos.some(neo => neo.isPotentiallyHazardous);

    return positions.map(sat => computeSingleSatelliteRisk(sat, weather, subsolar, hasPHA));
}
```

### 2.11 Top Risk Satellites Helper

```typescript
export function getTopRiskSatellites(
    enriched: SatPosition[],
    count: number = 10
): SatRiskSummary[] {
    return enriched
        .filter(s => (s.riskScore ?? 0) > 0)
        .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
        .slice(0, count)
        .map(s => ({
            noradId: s.id,
            name: s.name,
            orbitRegime: s.orbitRegime!,
            riskScore: s.riskScore!,
            riskLevel: s.riskLevel!,
            threats: s.threats ?? [],
        }));
}
```

### 2.12 Detailed Breakdown (For REST Endpoint)

```typescript
export function computeDetailedBreakdown(
    sat: SatPosition,
    weather: SpaceWeatherState | null,
    neos: NEOObject[]
): SatRiskBreakdown {
    const regime = classifyOrbit(sat.alt);
    const now = new Date();
    const subsolar = getSubsolarPoint(now);
    const zenith = getSolarZenithAngle(sat.lat, sat.lng, subsolar);
    const sunlit = zenith < 100;
    const inSAA = regime === 'LEO' && isInSAA(sat.lat, sat.lng);
    const hasPHA = neos.some(neo => neo.isPotentiallyHazardous);

    const wx = weather ?? {
        xrayClass: null, kpIndex: null, protonFlux: null,
        solarWindSpeed: null, bz: null, timestamp: new Date().toISOString(),
    };

    const flare = scoreFlareExposure(wx.xrayClass, zenith);
    const geo = scoreGeomagnetic(wx.kpIndex, regime, sat.alt);
    const rad = scoreRadiation(wx.protonFlux, regime, sat.lat, sat.lng);
    const wind = scoreSolarWind(wx.solarWindSpeed, regime);
    const neo = scoreNeo(hasPHA);
    const compound = computeCompoundBonus(wx.xrayClass, wx.kpIndex, wx.protonFlux, regime, sunlit);
    const bzMult = getBzMultiplier(wx.bz);

    const rawTotal = flare.score + geo.score + rad.score + wind.score + neo.score + compound.score;
    const finalScore = Math.min(Math.round(rawTotal * bzMult), 100);

    const level: RiskLevel =
        finalScore >= 70 ? 'CRITICAL' :
        finalScore >= 40 ? 'HIGH' :
        finalScore >= 20 ? 'MODERATE' : 'LOW';

    const threats = [flare, geo, rad, wind, neo, compound]
        .map(r => r.threat)
        .filter((t): t is string => t !== null);

    return {
        satellite: {
            noradId: sat.id,
            name: sat.name,
            orbitRegime: regime,
            altitude: sat.alt,
            lat: sat.lat,
            lng: sat.lng,
            isSunlit: zenith < 90,
            isInSAA: inSAA,
            solarZenithAngle: Math.round(zenith * 100) / 100,
        },
        scoring: {
            flareExposure: flare.score,
            geomagnetic: geo.score,
            radiation: rad.score,
            solarWind: wind.score,
            neo: neo.score,
            compound: compound.score,
            bzMultiplier: bzMult,
            rawTotal,
            finalScore,
        },
        level,
        threats,
        timestamp: new Date().toISOString(),
    };
}
```

---

## Phase 3: Gateway Integration

### 3.1 Wire Into Broadcast Loop

**File:** `packages/gateway/src/index.ts`

The existing 10-second satellite broadcast loop currently looks like:

```typescript
setInterval(() => {
    const positions = propagateAll();
    io.emit('satellite-positions', positions);
}, 10_000);
```

Change to:

```typescript
import { computePerSatelliteRisk, getTopRiskSatellites } from './satRisk.js';
import { getLatestState } from './agentState.js';

// Cache the latest enriched positions for REST endpoints
let latestEnrichedPositions: SatPosition[] = [];
let latestTopRisk: SatRiskSummary[] = [];

setInterval(() => {
    const positions = propagateAll();
    const state = getLatestState();

    const enriched = computePerSatelliteRisk(
        positions,
        state?.spaceWeather ?? null,
        state?.neos ?? []
    );

    latestEnrichedPositions = enriched;
    latestTopRisk = getTopRiskSatellites(enriched, 20);

    io.emit('satellite-positions', enriched);
}, 10_000);

// Export for use by routes.ts
export function getEnrichedPositions(): SatPosition[] {
    return latestEnrichedPositions;
}

export function getTopRisk(): SatRiskSummary[] {
    return latestTopRisk;
}
```

### 3.2 Expose `getLatestState()` From Agent State

**File:** `packages/gateway/src/agentState.ts`

Ensure the module exports a function that returns the latest space weather and NEO data for the `satRisk` module to consume. The current `latest` hot cache already stores `spaceWeather` and `neos` from the agent push. Add an accessor if one doesn't exist:

```typescript
export function getLatestState(): {
    spaceWeather: SpaceWeatherState | null;
    neos: NEOObject[];
} {
    return {
        spaceWeather: latest.spaceWeather ?? null,
        neos: latest.neos ?? [],
    };
}
```

### 3.3 Handle Initial Connection

When a new Socket.io client connects, send enriched positions instead of raw:

```typescript
io.on('connection', (socket) => {
    // Send latest enriched positions on connect
    const enriched = getEnrichedPositions();
    if (enriched.length > 0) {
        socket.emit('satellite-positions', enriched);
    } else {
        // Fallback: propagate without risk if no agent data yet
        socket.emit('satellite-positions', propagateAll());
    }
    // ... rest of existing connection handler
});
```

---

## Phase 4: REST API

**File:** `packages/gateway/src/routes.ts`

### 4.1 Update Existing Satellites Endpoint

Change `GET /api/satellites` to return enriched positions:

```typescript
import { getEnrichedPositions, getTopRisk } from './index.js';
import { computeDetailedBreakdown } from './satRisk.js';
import { getSatelliteById } from './satellites.js';
import { getLatestState } from './agentState.js';

router.get('/api/satellites', (req, res) => {
    const enriched = getEnrichedPositions();
    res.json({
        count: enriched.length,
        positions: enriched,
    });
});
```

### 4.2 New: Top Risk Satellites Endpoint

```typescript
router.get('/api/satellites/top-risk', (req, res) => {
    const count = Math.min(parseInt(req.query.count as string) || 20, 100);
    const topRisk = getTopRisk().slice(0, count);
    res.json({ count: topRisk.length, satellites: topRisk });
});
```

### 4.3 New: Single Satellite Risk Detail

```typescript
router.get('/api/satellites/:noradId/risk', (req, res) => {
    const noradId = parseInt(req.params.noradId);
    if (isNaN(noradId)) {
        return res.status(400).json({ error: 'Invalid NORAD ID' });
    }

    const satData = getSatelliteById(noradId);
    if (!satData) {
        return res.status(404).json({ error: 'Satellite not found' });
    }

    const state = getLatestState();
    const breakdown = computeDetailedBreakdown(
        satData.position,
        state.spaceWeather,
        state.neos
    );

    res.json(breakdown);
});
```

### 4.4 New: Risk Distribution Stats

Useful for dashboards and the risk overview panel.

```typescript
router.get('/api/satellites/risk-stats', (req, res) => {
    const enriched = getEnrichedPositions();
    const stats = {
        total: enriched.length,
        byLevel: {
            CRITICAL: enriched.filter(s => s.riskLevel === 'CRITICAL').length,
            HIGH: enriched.filter(s => s.riskLevel === 'HIGH').length,
            MODERATE: enriched.filter(s => s.riskLevel === 'MODERATE').length,
            LOW: enriched.filter(s => s.riskLevel === 'LOW').length,
        },
        byRegime: {
            LEO: enriched.filter(s => s.orbitRegime === 'LEO').length,
            MEO: enriched.filter(s => s.orbitRegime === 'MEO').length,
            GEO: enriched.filter(s => s.orbitRegime === 'GEO').length,
            HEO: enriched.filter(s => s.orbitRegime === 'HEO').length,
        },
        topRisk: getTopRisk().slice(0, 5),
        timestamp: new Date().toISOString(),
    };
    res.json(stats);
});
```

---

## Phase 5: Frontend Store & Socket

### 5.1 Update Zustand Store

**File:** `packages/frontend/src/stores/missionStore.ts`

The store already holds `satellites: SatPosition[]`. Since the type is being extended (not replaced), the store automatically receives the new fields when the gateway sends enriched positions. No structural change needed to the store shape.

Add a derived selector for top risk:

```typescript
// Add to the store or as a standalone selector
export const useTopRiskSatellites = (count = 10) => {
    return useMissionStore(state =>
        [...state.satellites]
            .filter(s => (s.riskScore ?? 0) > 0)
            .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
            .slice(0, count)
    );
};

export const useRiskDistribution = () => {
    return useMissionStore(state => {
        const sats = state.satellites;
        return {
            CRITICAL: sats.filter(s => s.riskLevel === 'CRITICAL').length,
            HIGH: sats.filter(s => s.riskLevel === 'HIGH').length,
            MODERATE: sats.filter(s => s.riskLevel === 'MODERATE').length,
            LOW: sats.filter(s => s.riskLevel === 'LOW').length,
        };
    });
};
```

### 5.2 Socket Hook — No Changes Needed

**File:** `packages/frontend/src/hooks/useSocket.ts`

The `satellite-positions` event handler already writes to `state.satellites`. Since the enriched `SatPosition` type is a superset, the handler works as-is. No socket changes required.

---

## Phase 6: Globe Visualization

### 6.1 Add Risk Color Helper

**File:** `packages/frontend/src/utils/colors.ts`

```typescript
export function getRiskLevelColor(level?: RiskLevel): string {
    if (!level) return RISK_COLORS.LOW;
    return RISK_COLORS[level] ?? RISK_COLORS.LOW;
}
```

### 6.2 Update Globe Point Coloring

**File:** `packages/frontend/src/components/globe/GlobeView.tsx`

Add a color mode toggle and change the `pointColor` callback:

```typescript
import { getRiskLevelColor, getAltitudeColor } from '../../utils/colors';

// Add state for color mode
const [colorMode, setColorMode] = useState<'altitude' | 'risk'>('risk');

// In the Globe component props:
pointColor={(d: SatPosition) =>
    colorMode === 'risk'
        ? getRiskLevelColor(d.riskLevel)
        : getAltitudeColor(d.alt)
}
```

Add a toggle button in the globe controls area:

```tsx
<button
    onClick={() => setColorMode(m => m === 'risk' ? 'altitude' : 'risk')}
    className="globe-toggle"
>
    Color: {colorMode === 'risk' ? 'Risk Level' : 'Altitude'}
</button>
```

### 6.3 Add Point Size by Risk

Make higher-risk satellites more visually prominent:

```typescript
pointRadius={(d: SatPosition) => {
    if (colorMode !== 'risk') return 0.15; // default size
    switch (d.riskLevel) {
        case 'CRITICAL': return 0.45;
        case 'HIGH': return 0.35;
        case 'MODERATE': return 0.25;
        default: return 0.15;
    }
}}
```

### 6.4 Add Click Handler for Detail Panel

```typescript
// Add state for selected satellite
const [selectedSat, setSelectedSat] = useState<SatPosition | null>(null);

// In Globe props:
onPointClick={(point: SatPosition) => setSelectedSat(point)}
```

### 6.5 Add Globe Legend

Add a color legend overlay on the globe showing what each color means:

```tsx
<div className="globe-legend">
    {colorMode === 'risk' ? (
        <>
            <span style={{ color: RISK_COLORS.LOW }}>● LOW</span>
            <span style={{ color: RISK_COLORS.MODERATE }}>● MODERATE</span>
            <span style={{ color: RISK_COLORS.HIGH }}>● HIGH</span>
            <span style={{ color: RISK_COLORS.CRITICAL }}>● CRITICAL</span>
        </>
    ) : (
        <>
            <span style={{ color: '#06b6d4' }}>● LEO</span>
            <span style={{ color: '#eab308' }}>● MEO</span>
            <span style={{ color: '#f59e0b' }}>● GEO</span>
            <span style={{ color: '#a855f7' }}>● HEO</span>
        </>
    )}
</div>
```

---

## Phase 7: Satellite Detail Panel

**New file:** `packages/frontend/src/components/satellite/SatelliteDetailPanel.tsx`

This panel opens when a user clicks a satellite on the globe. It fetches the detailed risk breakdown from the REST API.

### 7.1 Component Structure

```tsx
interface Props {
    satellite: SatPosition;
    onClose: () => void;
}

export function SatelliteDetailPanel({ satellite, onClose }: Props) {
    const [breakdown, setBreakdown] = useState<SatRiskBreakdown | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetch(`/api/satellites/${satellite.id}/risk`)
            .then(res => res.json())
            .then(data => { setBreakdown(data); setLoading(false); })
            .catch(() => setLoading(false));
    }, [satellite.id]);

    return (
        <div className="satellite-detail-panel">
            <header>
                <h3>{satellite.name}</h3>
                <span className="norad-id">NORAD {satellite.id}</span>
                <button onClick={onClose}>✕</button>
            </header>

            {/* Orbital info */}
            <section className="orbital-info">
                <div>Regime: <strong>{satellite.orbitRegime}</strong></div>
                <div>Altitude: <strong>{satellite.alt.toFixed(1)} km</strong></div>
                <div>Position: {satellite.lat.toFixed(2)}°, {satellite.lng.toFixed(2)}°</div>
                <div>Sunlit: {satellite.isSunlit ? '☀ Yes' : '● Shadow'}</div>
                <div>SAA: {satellite.isInSAA ? '⚠ Inside' : 'Outside'}</div>
            </section>

            {/* Risk score */}
            <section className="risk-score">
                <div className={`risk-badge ${satellite.riskLevel?.toLowerCase()}`}>
                    {satellite.riskLevel}
                </div>
                <div className="score-number">{satellite.riskScore}/100</div>
            </section>

            {/* Detailed breakdown (from REST API) */}
            {breakdown && (
                <section className="risk-breakdown">
                    <h4>Score Breakdown</h4>
                    <BreakdownBar label="Flare" value={breakdown.scoring.flareExposure} max={40} />
                    <BreakdownBar label="Geomagnetic" value={breakdown.scoring.geomagnetic} max={45} />
                    <BreakdownBar label="Radiation" value={breakdown.scoring.radiation} max={35} />
                    <BreakdownBar label="Solar Wind" value={breakdown.scoring.solarWind} max={15} />
                    <BreakdownBar label="NEO" value={breakdown.scoring.neo} max={5} />
                    <BreakdownBar label="Compound" value={breakdown.scoring.compound} max={45} />
                    {breakdown.scoring.bzMultiplier > 1 && (
                        <div className="bz-multiplier">
                            Bz multiplier: ×{breakdown.scoring.bzMultiplier}
                        </div>
                    )}
                </section>
            )}

            {/* Active threats */}
            {satellite.threats && satellite.threats.length > 0 && (
                <section className="threats">
                    <h4>Active Threats</h4>
                    <ul>
                        {satellite.threats.map((t, i) => <li key={i}>{t}</li>)}
                    </ul>
                </section>
            )}
        </div>
    );
}
```

### 7.2 Wire Into GlobeView

```tsx
// In GlobeView.tsx, conditionally render the detail panel:
{selectedSat && (
    <SatelliteDetailPanel
        satellite={selectedSat}
        onClose={() => setSelectedSat(null)}
    />
)}
```

---

## Phase 8: Satellite List & Filter

**New file:** `packages/frontend/src/components/satellite/SatelliteList.tsx`

### 8.1 Component Features

- Searchable by name or NORAD ID
- Filterable by orbit regime (LEO/MEO/GEO/HEO) via multi-select
- Filterable by risk level (checkboxes for each level)
- Sortable by risk score (default: highest first), name, altitude
- Paginated (50 per page for performance — rendering 5,000+ rows is expensive)
- Click a row to center globe on that satellite and open detail panel

### 8.2 Component Skeleton

```tsx
export function SatelliteList({ onSelectSatellite }: {
    onSelectSatellite: (sat: SatPosition) => void;
}) {
    const satellites = useMissionStore(s => s.satellites);
    const [search, setSearch] = useState('');
    const [regimeFilter, setRegimeFilter] = useState<Set<OrbitRegime>>(new Set(['LEO', 'MEO', 'GEO', 'HEO']));
    const [levelFilter, setLevelFilter] = useState<Set<RiskLevel>>(new Set(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']));
    const [sortField, setSortField] = useState<'riskScore' | 'name' | 'alt'>('riskScore');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 50;

    const filtered = useMemo(() => {
        return satellites
            .filter(s => {
                if (search) {
                    const q = search.toLowerCase();
                    if (!s.name.toLowerCase().includes(q) && !String(s.id).includes(q)) return false;
                }
                if (!regimeFilter.has(s.orbitRegime!)) return false;
                if (!levelFilter.has(s.riskLevel!)) return false;
                return true;
            })
            .sort((a, b) => {
                const valA = a[sortField] ?? 0;
                const valB = b[sortField] ?? 0;
                return sortDir === 'desc' ? (valB as number) - (valA as number) : (valA as number) - (valB as number);
            });
    }, [satellites, search, regimeFilter, levelFilter, sortField, sortDir]);

    const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

    // ... render search bar, filter chips, table with columns:
    // [Name | NORAD ID | Regime | Alt | Risk Score | Level | Threats]
}
```

### 8.3 Performance Note

The satellite list filters/sorts on every render cycle (every 10 seconds when positions update). With `useMemo` on the filtered result, this is fast for 5,000 satellites — `Array.filter().sort()` on 5,000 objects takes < 5ms. No virtualization needed for the paginated view.

---

## Phase 9: Watchlist

### 9.1 Watchlist Store

**New file:** `packages/frontend/src/stores/watchlistStore.ts`

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WatchlistState {
    watchedIds: Set<number>;      // NORAD IDs
    add: (id: number) => void;
    remove: (id: number) => void;
    toggle: (id: number) => void;
    isWatched: (id: number) => boolean;
    clear: () => void;
}

export const useWatchlistStore = create<WatchlistState>()(
    persist(
        (set, get) => ({
            watchedIds: new Set(),
            add: (id) => set(s => ({ watchedIds: new Set(s.watchedIds).add(id) })),
            remove: (id) => set(s => {
                const next = new Set(s.watchedIds);
                next.delete(id);
                return { watchedIds: next };
            }),
            toggle: (id) => {
                const s = get();
                s.watchedIds.has(id) ? s.remove(id) : s.add(id);
            },
            isWatched: (id) => get().watchedIds.has(id),
            clear: () => set({ watchedIds: new Set() }),
        }),
        {
            name: 'sentinel-watchlist',
            // Custom serializer for Set
            storage: {
                getItem: (name) => {
                    const raw = localStorage.getItem(name);
                    if (!raw) return null;
                    const parsed = JSON.parse(raw);
                    parsed.state.watchedIds = new Set(parsed.state.watchedIds);
                    return parsed;
                },
                setItem: (name, value) => {
                    const serialized = {
                        ...value,
                        state: {
                            ...value.state,
                            watchedIds: Array.from(value.state.watchedIds),
                        },
                    };
                    localStorage.setItem(name, JSON.stringify(serialized));
                },
                removeItem: (name) => localStorage.removeItem(name),
            },
        }
    )
);
```

### 9.2 Watchlist Panel

**New file:** `packages/frontend/src/components/satellite/WatchlistPanel.tsx`

Shows only watched satellites with live risk scores. Highlights satellites that transition to HIGH/CRITICAL.

```tsx
export function WatchlistPanel({ onSelectSatellite }: {
    onSelectSatellite: (sat: SatPosition) => void;
}) {
    const watchedIds = useWatchlistStore(s => s.watchedIds);
    const satellites = useMissionStore(s => s.satellites);
    const toggle = useWatchlistStore(s => s.toggle);

    const watched = useMemo(() =>
        satellites
            .filter(s => watchedIds.has(s.id))
            .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0)),
        [satellites, watchedIds]
    );

    if (watched.length === 0) {
        return <div className="watchlist-empty">No satellites watched. Click ☆ on the globe or list to add.</div>;
    }

    return (
        <div className="watchlist-panel">
            <h3>Watchlist ({watched.length})</h3>
            {watched.map(sat => (
                <div
                    key={sat.id}
                    className={`watchlist-item ${sat.riskLevel?.toLowerCase()}`}
                    onClick={() => onSelectSatellite(sat)}
                >
                    <span className="sat-name">{sat.name}</span>
                    <span className={`risk-badge ${sat.riskLevel?.toLowerCase()}`}>
                        {sat.riskScore} — {sat.riskLevel}
                    </span>
                    <button onClick={(e) => { e.stopPropagation(); toggle(sat.id); }}>
                        ★ Remove
                    </button>
                </div>
            ))}
        </div>
    );
}
```

### 9.3 Browser Notifications for Watched Satellites

**New file:** `packages/frontend/src/hooks/useWatchlistAlerts.ts`

```typescript
export function useWatchlistAlerts() {
    const watchedIds = useWatchlistStore(s => s.watchedIds);
    const satellites = useMissionStore(s => s.satellites);
    const prevLevels = useRef<Map<number, RiskLevel>>(new Map());

    useEffect(() => {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        for (const sat of satellites) {
            if (!watchedIds.has(sat.id)) continue;

            const prev = prevLevels.current.get(sat.id);
            const curr = sat.riskLevel;

            if (prev && curr && isEscalation(prev, curr)) {
                if (Notification.permission === 'granted') {
                    new Notification(`⚠ ${sat.name} — ${curr}`, {
                        body: `Risk escalated from ${prev} to ${curr}. Score: ${sat.riskScore}/100.\n${(sat.threats ?? []).join(', ')}`,
                        tag: `sat-${sat.id}-${curr}`, // dedup same notification
                    });
                }
            }

            if (curr) prevLevels.current.set(sat.id, curr);
        }
    }, [satellites, watchedIds]);
}

function isEscalation(prev: RiskLevel, curr: RiskLevel): boolean {
    const order = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
    return order[curr] > order[prev] && order[curr] >= 2; // alert on HIGH or CRITICAL
}
```

### 9.4 Globe Watchlist Highlighting

In `GlobeView.tsx`, make watched satellites visually distinct:

```typescript
const isWatched = useWatchlistStore(s => s.isWatched);

// Ring layer for watched satellites
ringsData={satellites.filter(s => isWatched(s.id))}
ringColor={() => 'rgba(255, 255, 255, 0.6)'}
ringMaxRadius={0.8}
ringPropagationSpeed={2}
```

---

## Phase 10: LLM Brief Enrichment

### 10.1 New Internal Endpoint on Gateway

**File:** `packages/gateway/src/routes.ts`

The agent needs per-satellite risk summaries for the LLM prompt. Add an internal endpoint:

```typescript
router.get('/internal/top-risk-satellites', (req, res) => {
    const secret = req.headers['x-internal-secret'];
    if (secret !== process.env.INTERNAL_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    const topRisk = getTopRisk();
    res.json({ satellites: topRisk });
});
```

### 10.2 Agent Fetches Satellite Risk Before Generating Brief

**File:** `packages/agent/src/llmBrief.ts`

Before building the LLM prompt, fetch top-risk satellites from the gateway:

```typescript
async function fetchTopRiskSatellites(): Promise<SatRiskSummary[]> {
    try {
        const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001';
        const res = await fetch(`${gatewayUrl}/internal/top-risk-satellites`, {
            headers: { 'x-internal-secret': process.env.INTERNAL_SECRET || '' },
        });
        if (!res.ok) return [];
        const data = await res.json();
        return data.satellites ?? [];
    } catch {
        return []; // Gateway may not be running, degrade gracefully
    }
}
```

### 10.3 Extend the LLM Prompt

In `buildUserPrompt()`, append a satellite risk section:

```typescript
async function buildUserPrompt(risk: RiskState, weather: SpaceWeatherState, ...): Promise<string> {
    // ... existing prompt sections ...

    const topSats = await fetchTopRiskSatellites();

    let satSection = '';
    if (topSats.length > 0) {
        satSection = '\n\nMOST AT-RISK SATELLITES:\n';
        for (const sat of topSats.slice(0, 10)) {
            satSection += `  ${sat.name} (NORAD ${sat.noradId}) — ${sat.riskLevel} (score ${sat.riskScore}): ${sat.threats.join(', ')}\n`;
        }
        satSection += '\nInclude satellite-specific guidance in your assessment where relevant.';
    }

    return existingPrompt + satSection;
}
```

### 10.4 Update System Prompt

Add a line to the system prompt telling Claude it may receive per-satellite context:

```
You may also receive data about specific satellites and their individual risk profiles.
When satellite-specific data is provided, include actionable guidance for the most at-risk
assets (e.g., "ISS should delay EVA operations", "LEO CubeSats on sunlit side should enter
safe mode during this flare window").
```

---

## Phase 11: Per-Satellite Alerts & Persistence

### 11.1 Prisma Schema Addition (Optional)

**File:** `packages/gateway/prisma/schema.prisma`

```prisma
model SatelliteRiskAlert {
    id        Int       @id @default(autoincrement())
    noradId   Int
    name      String
    regime    String
    riskScore Int
    riskLevel String
    prevLevel String
    threats   String[]
    timestamp DateTime  @default(now())

    @@index([noradId, timestamp])
    @@index([riskLevel, timestamp])
}
```

Run migration: `cd packages/gateway && npx prisma migrate dev --name add_satellite_risk_alerts`

### 11.2 Alert Detection in Broadcast Loop

**File:** `packages/gateway/src/index.ts`

Track previous risk levels and emit alerts on escalation:

```typescript
const prevSatLevels = new Map<number, RiskLevel>();

// Inside the 10-second broadcast interval, after computing enriched positions:
const satAlerts: Array<{ sat: SatPosition; prevLevel: RiskLevel }> = [];

for (const sat of enriched) {
    const prev = prevSatLevels.get(sat.id);
    const curr = sat.riskLevel;
    if (prev && curr && isEscalation(prev, curr)) {
        satAlerts.push({ sat, prevLevel: prev });
    }
    if (curr) prevSatLevels.set(sat.id, curr);
}

if (satAlerts.length > 0) {
    io.emit('satellite-risk-alerts', satAlerts.map(a => ({
        noradId: a.sat.id,
        name: a.sat.name,
        orbitRegime: a.sat.orbitRegime,
        riskScore: a.sat.riskScore,
        riskLevel: a.sat.riskLevel,
        prevLevel: a.prevLevel,
        threats: a.sat.threats,
        timestamp: new Date().toISOString(),
    })));

    // Persist to database (fire-and-forget)
    for (const a of satAlerts) {
        prisma.satelliteRiskAlert.create({
            data: {
                noradId: a.sat.id,
                name: a.sat.name,
                regime: a.sat.orbitRegime!,
                riskScore: a.sat.riskScore!,
                riskLevel: a.sat.riskLevel!,
                prevLevel: a.prevLevel,
                threats: a.sat.threats ?? [],
            },
        }).catch(err => console.error('Failed to persist satellite alert:', err));
    }
}
```

### 11.3 Frontend Alert Integration

**File:** `packages/frontend/src/hooks/useSocket.ts`

Add listener for the new event:

```typescript
socket.on('satellite-risk-alerts', (alerts) => {
    // Add to the alert panel's alert list
    for (const alert of alerts) {
        missionStore.getState().addAlert({
            type: 'satellite-risk',
            level: alert.riskLevel,
            message: `${alert.name} entered ${alert.riskLevel} (was ${alert.prevLevel}) — ${alert.threats.join(', ')}`,
            timestamp: alert.timestamp,
        });
    }
});
```

---

## Testing Strategy

### Unit Tests (`packages/gateway/src/__tests__/satRisk.test.ts`)

Every pure function in `satRisk.ts` should have dedicated unit tests:

| Test Suite | Key Test Cases |
|-----------|----------------|
| `getSubsolarPoint` | Noon UTC → lng 0°; midnight UTC → lng 180°; summer solstice → lat ~23.4°; winter → lat ~-23.4° |
| `getSolarZenithAngle` | Same point as subsolar → 0°; antipodal → 180°; 90° offset → ~90° |
| `classifyOrbit` | 400 km → LEO; 20,200 km → MEO; 35,786 km → GEO; 40,000 km → HEO |
| `isInSAA` | (-30, -50) → true; (0, 0) → false; (-50, -90) → true (boundary) |
| `scoreFlareExposure` | X1 + zenith 45° → 40; M6 + zenith 95° → 13 (half of 25); M3 + zenith 110° → 0 |
| `scoreGeomagnetic` | Kp 7 + LEO 400km → 45 (30×1.5); Kp 5 + GEO → 0; Kp 7 + LEO 800km → 30 |
| `scoreRadiation` | 100 pfu + LEO in SAA → 35; 10 pfu + MEO → 20; 50 pfu + GEO → 8 |
| `scoreSolarWind` | 800 km/s + GEO → 15; 600 km/s + LEO → 0 |
| `computeCompoundBonus` | M5+ + Kp 5 + LEO sunlit → 25; Kp 7 + 100 pfu + LEO → 20; X1 sunlit → 10 |
| `getBzMultiplier` | Bz -12 → 1.2; Bz -7 → 1.1; Bz 0 → 1.0 |
| `computeSingleSatelliteRisk` | Full integration test with known weather state + known position → expected score |
| `computePerSatelliteRisk` | Null weather → all scores 0; normal weather → scores vary by orbit |

### Integration Tests

| Test | What It Validates |
|------|-------------------|
| Gateway broadcast loop | `propagateAll()` + `computePerSatelliteRisk()` returns enriched positions with all new fields present |
| REST `/api/satellites/:id/risk` | Returns valid `SatRiskBreakdown` for a known NORAD ID |
| REST `/api/satellites/risk-stats` | Returns correct counts by level and regime |
| Socket enrichment | Client receives `satellite-positions` events with `riskScore` field present |
| Satellite risk alerts | Simulated level transition emits `satellite-risk-alerts` event |

### Scenario Tests

| Scenario | Expected Outcome |
|----------|-----------------|
| X-class flare, ISS on sunlit side | ISS riskScore > 50, includes "X-class flare (sunlit)" threat |
| X-class flare, ISS in shadow | ISS flare contribution = 0, lower overall score |
| Kp 8 storm, LEO sat at 350 km | Geomagnetic score = 45 (30 × 1.5), LEO-specific threat |
| Kp 8 storm, GEO sat | Geomagnetic score = 0 |
| Proton event, sat over Brazil (-30, -50) | Radiation + SAA bonus = base + 10 |
| All quiet conditions | All satellites score 0, level = LOW, no threats |
| Compound: M5+ flare + Kp 7 + 100 pfu, LEO sunlit | All three compound rules fire, high total score |

### Performance Tests

- Benchmark `computePerSatelliteRisk()` with 10,000 synthetic positions → should complete in < 20ms
- Benchmark with 5,000 positions (realistic catalog) → should complete in < 10ms
- Verify no per-satellite API calls or async operations in the hot path

---

## Migration Checklist

This is the ordered list of steps for a safe rollout:

### Pre-Implementation
- [ ] Verify `satellite.js` exports are sufficient (no additional astronomy library needed for subsolar point)
- [ ] Confirm `packages/shared/src/types.ts` is the canonical types file imported by both gateway and frontend

### Phase 1 — Types (No runtime impact)
- [ ] Add `OrbitRegime`, `SatRiskBreakdown`, `SatRiskSummary` to shared types
- [ ] Extend `SatPosition` with optional risk fields
- [ ] Run `npm run build` in all packages to verify no type errors

### Phase 2 — Core Module (No runtime impact)
- [ ] Create `packages/gateway/src/satRisk.ts` with all pure functions
- [ ] Write unit tests, run them, verify all pass
- [ ] Benchmark batch scorer with synthetic data

### Phase 3 — Gateway Integration (Runtime change — backend only)
- [ ] Wire `computePerSatelliteRisk()` into the 10-second broadcast loop
- [ ] Ensure `getLatestState()` is exported from `agentState.ts`
- [ ] Update initial connection handler to send enriched positions
- [ ] Start gateway, verify `satellite-positions` events include `riskScore` field
- [ ] Verify no performance regression in broadcast loop timing

### Phase 4 — REST API (Additive — new endpoints)
- [ ] Add `/api/satellites/top-risk`, `/api/satellites/:id/risk`, `/api/satellites/risk-stats`
- [ ] Update `/api/satellites` to return enriched positions
- [ ] Test all endpoints with `curl` / Postman

### Phase 5 — Frontend Store (No visual change)
- [ ] Add `useTopRiskSatellites` and `useRiskDistribution` selectors
- [ ] Verify store receives enriched positions via Socket.io (check DevTools)

### Phase 6 — Globe (Visual change)
- [ ] Add `getRiskLevelColor()` to colors utility
- [ ] Update globe `pointColor` to use risk-based coloring
- [ ] Add color mode toggle button
- [ ] Add risk-based point sizing
- [ ] Add click handler for satellite selection
- [ ] Add globe legend overlay
- [ ] Visual QA: verify colors match expected risk levels

### Phase 7 — Detail Panel (New UI)
- [ ] Create `SatelliteDetailPanel` component
- [ ] Wire into GlobeView via click handler
- [ ] Verify REST call to `/api/satellites/:id/risk` returns data
- [ ] Visual QA: breakdown bars, threat list, sunlit/SAA indicators

### Phase 8 — Satellite List (New UI)
- [ ] Create `SatelliteList` component
- [ ] Wire into main layout (sidebar or tab)
- [ ] Test search, filter, sort functionality
- [ ] Verify click-to-select centers globe and opens detail panel

### Phase 9 — Watchlist (New feature)
- [ ] Create `watchlistStore` with localStorage persistence
- [ ] Create `WatchlistPanel` component
- [ ] Add watch/unwatch button to detail panel and satellite list
- [ ] Add ring highlighting for watched satellites on globe
- [ ] Add `useWatchlistAlerts` hook for browser notifications
- [ ] Test: add to watchlist → refresh page → watchlist persists
- [ ] Test: simulate risk escalation → browser notification fires

### Phase 10 — LLM Brief Enrichment (Agent change)
- [ ] Add `/internal/top-risk-satellites` endpoint to gateway
- [ ] Add `fetchTopRiskSatellites()` to agent's `llmBrief.ts`
- [ ] Extend `buildUserPrompt()` with satellite risk section
- [ ] Update system prompt with satellite-aware instructions
- [ ] Test: trigger brief generation → verify satellite context appears in prompt
- [ ] Test: verify graceful degradation when gateway is unreachable

### Phase 11 — Alerts & Persistence (Full integration)
- [ ] Add `SatelliteRiskAlert` model to Prisma schema
- [ ] Run `npx prisma migrate dev`
- [ ] Add level-transition detection to broadcast loop
- [ ] Emit `satellite-risk-alerts` Socket.io event
- [ ] Add frontend listener in `useSocket` hook
- [ ] Verify alerts appear in alert panel
- [ ] Verify alerts persist to database

### Post-Implementation
- [ ] Run full test suite
- [ ] Run lint + format check
- [ ] Performance audit: measure broadcast loop with enrichment under load
- [ ] Update `docs/ARCHITECTURE.md` with per-satellite risk flow
- [ ] Update `docs/API_REFERENCE.md` with new endpoints
- [ ] Update `CLAUDE.md` key modules section

---

## File Summary

| Action | File | Phase |
|--------|------|-------|
| **Modify** | `packages/shared/src/types.ts` | 1 |
| **Create** | `packages/gateway/src/satRisk.ts` | 2 |
| **Create** | `packages/gateway/src/__tests__/satRisk.test.ts` | 2 |
| **Modify** | `packages/gateway/src/agentState.ts` | 3 |
| **Modify** | `packages/gateway/src/index.ts` | 3, 11 |
| **Modify** | `packages/gateway/src/routes.ts` | 4, 10 |
| **Modify** | `packages/frontend/src/stores/missionStore.ts` | 5 |
| **Modify** | `packages/frontend/src/utils/colors.ts` | 6 |
| **Modify** | `packages/frontend/src/components/globe/GlobeView.tsx` | 6, 9 |
| **Create** | `packages/frontend/src/components/satellite/SatelliteDetailPanel.tsx` | 7 |
| **Create** | `packages/frontend/src/components/satellite/SatelliteList.tsx` | 8 |
| **Create** | `packages/frontend/src/stores/watchlistStore.ts` | 9 |
| **Create** | `packages/frontend/src/components/satellite/WatchlistPanel.tsx` | 9 |
| **Create** | `packages/frontend/src/hooks/useWatchlistAlerts.ts` | 9 |
| **Modify** | `packages/agent/src/llmBrief.ts` | 10 |
| **Modify** | `packages/gateway/prisma/schema.prisma` | 11 |
| **Modify** | `packages/frontend/src/hooks/useSocket.ts` | 11 |
