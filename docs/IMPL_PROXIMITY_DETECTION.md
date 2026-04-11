# Implementation Plan: Proximity Detection

**PRD**: [PRD_PROXIMITY_DETECTION.md](PRD_PROXIMITY_DETECTION.md)
**Date**: 2026-04-11

This document specifies the exact file changes, function signatures, and implementation order for both proximity features. Each step is independently testable.

---

## Phase 1: Per-Satellite NEO Proximity Scoring

**Goal**: Replace the flat `scoreNeo(hasPHA: boolean) → 5` with a distance-based `scoreNeoProximity(neos, satAlt, regime) → 0-30`.

### Step 1.1 — Add shared types

**File**: `packages/shared/src/types.ts`

Add after `NEOObject` (line 80):

```typescript
export interface NeoProximityDetail {
    neoId: string;
    neoName: string;
    missDistanceKm: number;
    shellDeltaKm: number;
    score: number;
    isPotentiallyHazardous: boolean;
}
```

Extend `SatPosition` (line 40-54) — add after `threats?: string[]`:

```typescript
    nearestNeo?: { name: string; shellDeltaKm: number; missDistanceKm: number };
```

### Step 1.2 — Replace `scoreNeo()` in gateway `satRisk.ts`

**File**: `packages/gateway/src/satRisk.ts`

Replace the current `scoreNeo` function (lines 219-223):

```typescript
// Old:
export function scoreNeo(hasPHA: boolean): ScoreResult { ... }

// New:
const EARTH_RADIUS_KM = 6371;

const NEO_REGIME_MARGINS: Record<OrbitRegime, number> = {
    LEO: 500,
    MEO: 2000,
    GEO: 1000,
    HEO: 5000,
};

export function scoreNeoProximity(
    neos: NEOObject[],
    satAltKm: number,
    regime: OrbitRegime,
): ScoreResult {
    const satOrbitalRadius = EARTH_RADIUS_KM + satAltKm;
    const margin = NEO_REGIME_MARGINS[regime];

    let maxScore = 0;
    let worstThreat: string | null = null;

    for (const neo of neos) {
        if (neo.missDistanceKm <= 0) continue;

        const shellDelta = Math.abs(neo.missDistanceKm - satOrbitalRadius);
        let score = 0;
        let threat: string | null = null;

        if (shellDelta < margin * 0.1) {
            score = neo.isPotentiallyHazardous ? 25 : 15;
            threat = `NEO ${neo.name} passes through ${regime} shell (${Math.round(shellDelta)} km from orbit)`;
        } else if (shellDelta < margin * 0.5) {
            score = neo.isPotentiallyHazardous ? 15 : 8;
            threat = `NEO ${neo.name} near ${regime} shell (${Math.round(shellDelta)} km)`;
        } else if (shellDelta < margin) {
            score = neo.isPotentiallyHazardous ? 8 : 3;
            threat = `NEO ${neo.name} in awareness zone (${Math.round(neo.missDistanceKm).toLocaleString()} km miss)`;
        } else if (neo.isPotentiallyHazardous && neo.missDistanceKm < 7_500_000) {
            score = 2;
            threat = `PHA ${neo.name} approaching (${Math.round(neo.missDistanceKm).toLocaleString()} km)`;
        }

        // Velocity multiplier
        if (score > 0 && neo.relativeVelocityKmS > 20) {
            score = Math.round(score * 1.2);
        }
        // Size multiplier
        if (score > 0 && neo.estimatedDiameter > 500) {
            score = Math.round(score * 1.3);
        }

        if (score > maxScore) {
            maxScore = score;
            worstThreat = threat;
        }
    }

    return { score: Math.min(maxScore, 30), threat: worstThreat };
}
```

### Step 1.3 — Update callers in gateway `satRisk.ts`

**`computeSingleSatelliteRisk()`** (line 291-339):

Change the function signature to accept `neos: NEOObject[]` instead of `hasPHA: boolean`:

```typescript
export function computeSingleSatelliteRisk(
    sat: SatPosition,
    weather: SpaceWeatherState,
    subsolar: { lat: number; lng: number },
    neos: NEOObject[],           // ← was: hasPHA: boolean
): SatPosition {
```

Replace the call on line 306:
```typescript
// Old:
const neo = scoreNeo(hasPHA);
// New:
const neo = scoreNeoProximity(neos, sat.alt, regime);
```

**`computePerSatelliteRisk()`** (line 345-369):

Remove `hasPHA` computation and pass `neos` directly:

```typescript
// Old (line 364):
const hasPHA = neos.some((neo) => neo.isPotentiallyHazardous);
// Remove this line

// Old (line 367):
computeSingleSatelliteRisk(sat, weather, subsolar, hasPHA),
// New:
computeSingleSatelliteRisk(sat, weather, subsolar, neos),
```

**`computeDetailedBreakdown()`** (line 397-473):

Same change — remove `hasPHA`, pass `neos`:

```typescript
// Old (line 408):
const hasPHA = neos.some((neo) => neo.isPotentiallyHazardous);
// Remove

// Old (line 423):
const neo = scoreNeo(hasPHA);
// New:
const neo = scoreNeoProximity(neos, sat.alt, regime);
```

### Step 1.4 — Replace `scoreNeo()` in agent `riskEngine.ts`

**File**: `packages/agent/src/riskEngine.ts`

Replace the existing `scoreNeo` (lines 92-94) with a global version:

```typescript
import type { NEOObject } from '@sentinel/shared';

const EARTH_RADIUS_KM = 6371;

const REFERENCE_SHELLS = [
    { regime: 'LEO', radius: EARTH_RADIUS_KM + 400, margin: 500 },
    { regime: 'MEO', radius: EARTH_RADIUS_KM + 20000, margin: 2000 },
    { regime: 'GEO', radius: EARTH_RADIUS_KM + 35786, margin: 1000 },
];

export function scoreNeoGlobal(neos: NEOObject[]): number {
    let maxScore = 0;
    for (const neo of neos) {
        if (neo.missDistanceKm <= 0) continue;
        for (const shell of REFERENCE_SHELLS) {
            const delta = Math.abs(neo.missDistanceKm - shell.radius);
            if (delta < shell.margin * 0.1) {
                maxScore = Math.max(maxScore, neo.isPotentiallyHazardous ? 20 : 10);
            } else if (delta < shell.margin) {
                maxScore = Math.max(maxScore, neo.isPotentiallyHazardous ? 10 : 5);
            }
        }
        // Preserve existing minimum for any PHA
        if (neo.isPotentiallyHazardous && maxScore < 5) {
            maxScore = 5;
        }
    }
    return Math.min(maxScore, 25);
}
```

Update the caller in `evaluate()` (around line 150):

```typescript
// Old:
const neo = scoreNeo(hasPHA);
// New:
const neo = scoreNeoGlobal(neos);
```

The `getUpcomingNeos` result (line 135-136) is already available as `neos`.

### Step 1.5 — Update frontend breakdown display

**File**: `packages/frontend/src/components/satellite/SatelliteDetailPanel.tsx`

Update `BREAKDOWN_MAX` (line 26-33):

```typescript
// Old:
neo: 5,
// New:
neo: 30,
```

### Step 1.6 — Unit tests for NEO scoring

**File**: `packages/gateway/src/__tests__/satRisk.test.ts` (extend existing or create)

Test cases:
- NEO passing through LEO shell (delta < 50km) → score 15-25
- NEO near GEO shell (delta < 500km) → score 8-15
- NEO far from all shells (delta > 5000km) → score 0
- PHA within lunar distance but not near any shell → score 2
- Velocity multiplier applied when > 20 km/s
- Size multiplier applied when > 500m diameter
- Score capped at 30
- No NEOs → score 0

**File**: `packages/agent/src/__tests__/riskEngine.test.ts` (extend existing)

Test cases for `scoreNeoGlobal`:
- PHA near LEO shell → 20
- Non-PHA near LEO shell → 10
- PHA far from all shells → 5 (minimum PHA floor)
- No NEOs → 0

### Step 1.7 — Verification

1. Run existing tests: `npm test` from workspace root
2. Start agent + gateway in demo mode: verify risk scores change when NEO data varies
3. Check `GET /api/satellites/:noradId/risk` — `scoring.neo` should now vary per satellite

---

## Phase 2: Conjunction Detection Engine

**Goal**: Detect satellite-to-satellite close approaches and integrate into risk scoring.

### Step 2.1 — Extend `TleRecord` with group

**File**: `packages/gateway/src/satellites.ts`

Add `group` to `TleRecord` interface (line 13-17):

```typescript
interface TleRecord {
    noradId: number;
    name: string;
    line1: string;
    line2: string;
    satrec: satellite.SatRec;
    group: string;               // ← NEW
}
```

Update `fetchTleGroup()` (line 74-110) to pass group name:

```typescript
async function fetchTleGroup(group: string): Promise<TleRecord[]> {
    // ... existing fetch logic ...
    try {
        const satrec = satellite.twoline2satrec(line1, line2);
        records.push({ noradId, name, line1, line2, satrec, group });  // ← add group
    }
    // ...
}
```

### Step 2.2 — Export ECI vectors from `propagateAll()`

**File**: `packages/gateway/src/satellites.ts`

Add a new exported type and function that returns positions with ECI data:

```typescript
export interface PropagatedSat extends SatPosition {
    eciX: number;
    eciY: number;
    eciZ: number;
    group: string;
}

export function propagateAllWithEci(): PropagatedSat[] {
    const now = new Date();
    const gmst = satellite.gstime(now);
    const results: PropagatedSat[] = [];

    for (const [, record] of tleCache) {
        try {
            const posVel = satellite.propagate(record.satrec, now);
            const position = posVel.position;
            if (!position || typeof position === 'boolean') continue;

            const geo = satellite.eciToGeodetic(position, gmst);
            results.push({
                id: record.noradId,
                name: record.name,
                lat: satellite.degreesLat(geo.latitude),
                lng: satellite.degreesLong(geo.longitude),
                alt: geo.height,
                eciX: position.x,
                eciY: position.y,
                eciZ: position.z,
                group: record.group,
            });
        } catch {
            // Skip propagation errors
        }
    }

    return results;
}
```

Update the existing `propagateAll()` to call `propagateAllWithEci()` internally (avoid duplicating propagation logic):

```typescript
export function propagateAll(): SatPosition[] {
    return propagateAllWithEci().map(({ eciX, eciY, eciZ, group, ...pos }) => pos);
}
```

### Step 2.3 — Create conjunction detection module

**File**: `packages/gateway/src/conjunction.ts` (NEW)

```typescript
import { v4 as uuid } from 'uuid';
import type { ConjunctionEvent, ConjunctionSeverity, OrbitRegime } from '@sentinel/shared';
import type { PropagatedSat } from './satellites';
import { classifyOrbit } from './satRisk';
import { logger } from './logger';

const log = logger.child({ component: 'Conjunction' });

// -----------------------------------------------------------------------
// Thresholds (km)
// -----------------------------------------------------------------------

const REGIME_THRESHOLDS: Record<OrbitRegime, number> = {
    LEO: 25,
    MEO: 50,
    GEO: 100,
    HEO: 50,
};

// -----------------------------------------------------------------------
// Altitude bands for Phase 1 filtering
// -----------------------------------------------------------------------

type AltBand = 'LEO_LOW' | 'LEO_HIGH' | 'MEO' | 'GEO' | 'HEO';

function getAltBand(altKm: number): AltBand {
    if (altKm < 600) return 'LEO_LOW';
    if (altKm < 2000) return 'LEO_HIGH';
    if (altKm < 35286) return 'MEO';
    if (altKm <= 36286) return 'GEO';
    return 'HEO';
}

const ADJACENT_BANDS: Record<AltBand, AltBand[]> = {
    LEO_LOW: ['LEO_LOW', 'LEO_HIGH'],
    LEO_HIGH: ['LEO_LOW', 'LEO_HIGH', 'MEO'],
    MEO: ['LEO_HIGH', 'MEO', 'GEO'],
    GEO: ['MEO', 'GEO', 'HEO'],
    HEO: ['GEO', 'HEO'],
};

// -----------------------------------------------------------------------
// Severity classification
// -----------------------------------------------------------------------

function classifySeverity(distKm: number, threshold: number): ConjunctionSeverity {
    if (distKm < threshold / 5) return 'CRITICAL';
    if (distKm < threshold / 2) return 'WARNING';
    return 'CLOSE_APPROACH';
}

function severityScore(severity: ConjunctionSeverity): number {
    switch (severity) {
        case 'CRITICAL': return 30;
        case 'WARNING': return 15;
        case 'CLOSE_APPROACH': return 5;
    }
}

// -----------------------------------------------------------------------
// Deduplication
// -----------------------------------------------------------------------

const alertDedup = new Map<string, number>(); // pairKey → timestamp
const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function pairKey(id1: number, id2: number): string {
    return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

function isNewAlert(id1: number, id2: number): boolean {
    const key = pairKey(id1, id2);
    const lastAlert = alertDedup.get(key);
    const now = Date.now();
    if (lastAlert && now - lastAlert < DEDUP_WINDOW_MS) return false;
    alertDedup.set(key, now);
    return true;
}

// Periodic cleanup of stale dedup entries
setInterval(() => {
    const cutoff = Date.now() - DEDUP_WINDOW_MS;
    for (const [key, ts] of alertDedup) {
        if (ts < cutoff) alertDedup.delete(key);
    }
}, 60_000);

// -----------------------------------------------------------------------
// Main detection function
// -----------------------------------------------------------------------

export interface ConjunctionResult {
    all: ConjunctionEvent[];       // all active conjunctions
    newAlerts: ConjunctionEvent[]; // only new WARNING/CRITICAL (for Socket.io alerts)
}

export function detectConjunctions(sats: PropagatedSat[]): ConjunctionResult {
    // Phase 1: bucket by altitude band
    const bands = new Map<AltBand, PropagatedSat[]>();
    for (const sat of sats) {
        const band = getAltBand(sat.alt);
        let arr = bands.get(band);
        if (!arr) { arr = []; bands.set(band, arr); }
        arr.push(sat);
    }

    const all: ConjunctionEvent[] = [];
    const newAlerts: ConjunctionEvent[] = [];
    const seen = new Set<string>();

    // Phase 2: pairwise within same + adjacent bands
    for (const [band, bandSats] of bands) {
        const adjacentBands = ADJACENT_BANDS[band];
        const candidates: PropagatedSat[] = [...bandSats];
        for (const adj of adjacentBands) {
            if (adj !== band) {
                const adjSats = bands.get(adj);
                if (adjSats) candidates.push(...adjSats);
            }
        }

        for (let i = 0; i < bandSats.length; i++) {
            const s1 = bandSats[i];
            const regime1 = classifyOrbit(s1.alt);

            for (let j = 0; j < candidates.length; j++) {
                const s2 = candidates[j];
                if (s1.id >= s2.id) continue; // avoid duplicates and self-compare

                const key = pairKey(s1.id, s2.id);
                if (seen.has(key)) continue;
                seen.add(key);

                // 3D Euclidean distance in ECI
                const dx = s1.eciX - s2.eciX;
                const dy = s1.eciY - s2.eciY;
                const dz = s1.eciZ - s2.eciZ;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Use the larger threshold of the two regimes
                const regime2 = classifyOrbit(s2.alt);
                const threshold = Math.max(
                    REGIME_THRESHOLDS[regime1],
                    REGIME_THRESHOLDS[regime2],
                );

                if (dist >= threshold) continue;

                const severity = classifySeverity(dist, threshold);
                const isIntra = s1.group === s2.group;

                const event: ConjunctionEvent = {
                    id: uuid(),
                    sat1Id: s1.id,
                    sat1Name: s1.name,
                    sat2Id: s2.id,
                    sat2Name: s2.name,
                    distanceKm: Math.round(dist * 100) / 100,
                    severity,
                    isIntraConstellation: isIntra,
                    sat1Regime: regime1,
                    sat2Regime: regime2,
                    sat1Position: { lat: s1.lat, lng: s1.lng, alt: s1.alt },
                    sat2Position: { lat: s2.lat, lng: s2.lng, alt: s2.alt },
                    timestamp: new Date().toISOString(),
                };

                all.push(event);

                // Only emit alerts for inter-constellation WARNING/CRITICAL
                if (!isIntra && severity !== 'CLOSE_APPROACH') {
                    if (isNewAlert(s1.id, s2.id)) {
                        newAlerts.push(event);
                    }
                }
            }
        }
    }

    if (all.length > 0) {
        log.info(
            { total: all.length, alerts: newAlerts.length },
            'Conjunctions detected',
        );
    }

    return { all, newAlerts };
}

// -----------------------------------------------------------------------
// Score helper — used by satRisk.ts
// -----------------------------------------------------------------------

export function scoreConjunction(
    satId: number,
    conjunctions: ConjunctionEvent[],
): { score: number; threat: string | null } {
    const relevant = conjunctions
        .filter(c => (c.sat1Id === satId || c.sat2Id === satId) && !c.isIntraConstellation)
        .sort((a, b) => a.distanceKm - b.distanceKm);

    if (relevant.length === 0) return { score: 0, threat: null };

    const worst = relevant[0];
    const otherName = worst.sat1Id === satId ? worst.sat2Name : worst.sat1Name;
    const score = severityScore(worst.severity);

    return {
        score,
        threat: `Conjunction with ${otherName} at ${worst.distanceKm.toFixed(1)} km (${worst.severity})`,
    };
}
```

### Step 2.4 — Add shared types for conjunctions

**File**: `packages/shared/src/types.ts`

Add after `NeoProximityDetail`:

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
```

Extend `SatPosition` — add:

```typescript
    conjunctions?: ConjunctionEvent[];
    conjunctionCount?: number;
```

Extend `SatRiskBreakdown.scoring` — add `conjunction: number` field (line 112-122).

### Step 2.5 — Integrate conjunctions into risk scoring

**File**: `packages/gateway/src/satRisk.ts`

Import conjunction scorer:

```typescript
import { scoreConjunction } from './conjunction';
import type { ConjunctionEvent } from '@sentinel/shared';
```

Update `computeSingleSatelliteRisk` signature to accept conjunctions:

```typescript
export function computeSingleSatelliteRisk(
    sat: SatPosition,
    weather: SpaceWeatherState,
    subsolar: { lat: number; lng: number },
    neos: NEOObject[],
    conjunctions: ConjunctionEvent[],  // ← NEW
): SatPosition {
```

Add conjunction scoring alongside other signals:

```typescript
    const conj = scoreConjunction(sat.id, conjunctions);
```

Add to raw score sum:

```typescript
    const rawScore =
        flare.score + geo.score + rad.score + wind.score +
        neo.score + conj.score + compound.score;
```

Add to threats array:

```typescript
    const threats = [flare, geo, rad, wind, neo, conj, compound]
        .map((r) => r.threat)
        .filter((t): t is string => t !== null);
```

Add conjunction data to returned SatPosition:

```typescript
    const satConjunctions = conjunctions.filter(
        c => c.sat1Id === sat.id || c.sat2Id === sat.id
    );

    return {
        ...sat,
        // ... existing fields ...
        conjunctions: satConjunctions.length > 0 ? satConjunctions : undefined,
        conjunctionCount: satConjunctions.length > 0 ? satConjunctions.length : undefined,
    };
```

**Add compound synergy rule** — in `computeCompoundBonus()`, add a new parameter and rule:

```typescript
export function computeCompoundBonus(
    xrayClass: string | null,
    kp: number | null,
    protonFlux: number | null,
    regime: OrbitRegime,
    sunlit: boolean,
    hasWarningConjunction?: boolean,  // ← NEW optional param
): ScoreResult {
    // ... existing rules ...

    // Conjunction during geomagnetic storm — drag increases TLE uncertainty
    if (hasWarningConjunction && kpHigh && regime === 'LEO') {
        bonus += 10;
        threats.push('Conjunction + geomagnetic storm (increased TLE uncertainty)');
    }
    // ...
}
```

Update `computeDetailedBreakdown()` similarly — add `conjunction` to the `scoring` output.

### Step 2.6 — Integrate into gateway broadcast loop

**File**: `packages/gateway/src/index.ts`

Import new functions:

```typescript
import { propagateAllWithEci } from './satellites';
import { detectConjunctions } from './conjunction';
import type { ConjunctionEvent } from '@sentinel/shared';
```

Add conjunction state:

```typescript
let latestConjunctions: ConjunctionEvent[] = [];
```

Modify `enrichAndBroadcast()` (line 86-167):

```typescript
function enrichAndBroadcast(): SatPosition[] {
    const propagated = propagateAllWithEci();   // ← was: propagateAll()
    const state = getLatestState();

    // Detect conjunctions using ECI vectors
    const { all: conjunctions, newAlerts } = detectConjunctions(propagated);
    latestConjunctions = conjunctions;

    // Strip ECI data for risk enrichment (SatPosition doesn't carry it)
    const positions: SatPosition[] = propagated.map(
        ({ eciX, eciY, eciZ, group, ...pos }) => pos
    );

    const enriched = computePerSatelliteRisk(
        positions,
        state.spaceWeather,
        state.neos,
        conjunctions,              // ← NEW parameter
    );

    // ... existing alert detection logic ...

    // Emit conjunction alerts
    if (newAlerts.length > 0) {
        io.emit('conjunction-alerts', newAlerts);
    }

    return enriched;
}
```

Update the 10-second broadcast loop (line 199-202):

```typescript
setInterval(() => {
    const enriched = enrichAndBroadcast();
    io.emit('satellite-positions', enriched);
    io.emit('conjunction-update', latestConjunctions);
}, 10_000);
```

Add conjunction data to new Socket.io connections (line 181-193):

```typescript
io.on('connection', (socket) => {
    // ... existing logic ...
    if (latestConjunctions.length > 0) {
        socket.emit('conjunction-update', latestConjunctions);
    }
});
```

Export getter for routes:

```typescript
export function getConjunctions(): ConjunctionEvent[] {
    return latestConjunctions;
}
```

### Step 2.7 — Update `computePerSatelliteRisk` signature

**File**: `packages/gateway/src/satRisk.ts`

```typescript
export function computePerSatelliteRisk(
    positions: SatPosition[],
    weather: SpaceWeatherState | null,
    neos: NEOObject[],
    conjunctions: ConjunctionEvent[],  // ← NEW
): SatPosition[] {
    // ...
    return positions.map((sat) =>
        computeSingleSatelliteRisk(sat, weather, subsolar, neos, conjunctions),
    );
}
```

### Step 2.8 — Add Prisma model

**File**: `packages/gateway/prisma/schema.prisma`

Append:

```prisma
model ConjunctionEvent {
    id                   String   @id @default(uuid())
    sat1NoradId          Int
    sat1Name             String
    sat2NoradId          Int
    sat2Name             String
    distanceKm           Float
    severity             String
    isIntraConstellation Boolean
    sat1Regime           String
    sat2Regime           String
    sat1Position         Json
    sat2Position         Json
    timestamp            DateTime @default(now())

    @@index([sat1NoradId, timestamp(sort: Desc)])
    @@index([sat2NoradId, timestamp(sort: Desc)])
    @@index([severity, timestamp(sort: Desc)])
    @@index([timestamp(sort: Desc)])
    @@map("conjunction_events")
}
```

Run migration:

```bash
cd packages/gateway && npx prisma migrate dev --name add_conjunction_events
```

### Step 2.9 — Add REST endpoints

**File**: `packages/gateway/src/routes.ts`

Add imports:

```typescript
import type { ConjunctionEvent } from '@sentinel/shared';
```

Add to `RouterDeps` interface (line 103-107):

```typescript
export interface RouterDeps {
    broadcast: (event: string, data: unknown) => void;
    getEnrichedPositions: () => SatPosition[];
    getTopRisk: () => SatRiskSummary[];
    getConjunctions: () => ConjunctionEvent[];  // ← NEW
}
```

Add routes inside `createRouter()`:

```typescript
// GET /api/conjunctions
router.get('/api/conjunctions', (req: Request, res: Response) => {
    let conjunctions = getConjunctions();
    const severity = req.query.severity as string;
    const noradId = parseInt(req.query.noradId as string, 10);
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    if (severity) {
        const levels = severity.split(',');
        conjunctions = conjunctions.filter(c => levels.includes(c.severity));
    }
    if (!isNaN(noradId)) {
        conjunctions = conjunctions.filter(
            c => c.sat1Id === noradId || c.sat2Id === noradId
        );
    }

    res.json({
        count: Math.min(conjunctions.length, limit),
        conjunctions: conjunctions.slice(0, limit),
    });
});

// GET /api/conjunctions/history
router.get('/api/conjunctions/history', async (req: Request, res: Response) => {
    try {
        const since = req.query.since
            ? new Date(req.query.since as string)
            : new Date(Date.now() - 24 * 60 * 60 * 1000);
        const severity = req.query.severity as string;
        const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

        const where: Record<string, unknown> = {
            timestamp: { gte: since },
        };
        if (severity) where.severity = severity;

        const events = await prisma.conjunctionEvent.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: limit,
        });
        res.json({ count: events.length, conjunctions: events });
    } catch (err) {
        routeLog.error({ err }, 'Failed to fetch conjunction history');
        res.status(500).json({ error: 'Failed to fetch conjunction history' });
    }
});

// GET /api/conjunctions/:noradId
router.get('/api/conjunctions/:noradId', (req: Request, res: Response) => {
    const noradId = parseInt(req.params.noradId, 10);
    if (isNaN(noradId)) {
        res.status(400).json({ error: 'Invalid NORAD ID' });
        return;
    }
    const conjunctions = getConjunctions().filter(
        c => c.sat1Id === noradId || c.sat2Id === noradId
    );
    res.json({ noradId, count: conjunctions.length, conjunctions });
});

// GET /internal/active-conjunctions — for agent LLM briefs
router.get('/internal/active-conjunctions', (_req: Request, res: Response) => {
    const conjunctions = getConjunctions()
        .filter(c => !c.isIntraConstellation)
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .slice(0, 20);
    res.json({ conjunctions });
});
```

### Step 2.10 — Persist conjunctions (fire-and-forget)

**File**: `packages/gateway/src/index.ts`

In `enrichAndBroadcast()`, after conjunction detection, persist new WARNING/CRITICAL events:

```typescript
// Persist conjunction alerts (fire-and-forget, capped)
for (const alert of newAlerts.slice(0, 10)) {
    prisma.conjunctionEvent
        .create({
            data: {
                sat1NoradId: alert.sat1Id,
                sat1Name: alert.sat1Name,
                sat2NoradId: alert.sat2Id,
                sat2Name: alert.sat2Name,
                distanceKm: alert.distanceKm,
                severity: alert.severity,
                isIntraConstellation: alert.isIntraConstellation,
                sat1Regime: alert.sat1Regime,
                sat2Regime: alert.sat2Regime,
                sat1Position: alert.sat1Position,
                sat2Position: alert.sat2Position,
            },
        })
        .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            satRiskLog.error({ err: msg }, 'Failed to persist conjunction event');
        });
}
```

### Step 2.11 — Unit tests

**File**: `packages/gateway/src/__tests__/conjunction.test.ts` (NEW)

Test cases:
- Two sats at same ECI position → CRITICAL conjunction detected
- Two sats 15km apart in LEO → WARNING
- Two sats 20km apart in LEO → CLOSE_APPROACH
- Two sats 30km apart in LEO → no conjunction
- Same group = `isIntraConstellation: true`
- Different bands (LEO vs GEO) → not compared
- Adjacent bands (LEO-low vs LEO-high) → compared
- Deduplication: same pair within 5 min → only first alert emitted
- `scoreConjunction` returns correct score/threat for worst conjunction

### Step 2.12 — Verification

1. Run `npx prisma migrate dev` to create the table
2. Run tests: `npm test`
3. Start gateway — check logs for `[Conjunction] Conjunctions detected` messages
4. `GET /api/conjunctions` — should return any active conjunctions
5. Check Socket.io: `conjunction-update` events arriving every 10s

---

## Phase 3: Frontend Visualization

### Step 3.1 — Update Zustand store

**File**: `packages/frontend/src/stores/missionStore.ts`

Add to state:

```typescript
conjunctions: ConjunctionEvent[];
setConjunctions: (conjunctions: ConjunctionEvent[]) => void;
```

Initialize `conjunctions: []` in the store creator, add setter.

### Step 3.2 — Update Socket.io hook

**File**: `packages/frontend/src/hooks/useSocket.ts`

Add listeners for new events:

```typescript
socket.on('conjunction-update', (data: ConjunctionEvent[]) => {
    useMissionStore.getState().setConjunctions(data);
});

socket.on('conjunction-alerts', (alerts: ConjunctionEvent[]) => {
    for (const alert of alerts) {
        useMissionStore.getState().addAlert({
            id: alert.id,
            level: alert.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
            score: 0,
            brief: `Conjunction: ${alert.sat1Name} <-> ${alert.sat2Name} at ${alert.distanceKm.toFixed(1)} km`,
            timestamp: alert.timestamp,
        });
    }
});
```

### Step 3.3 — Add conjunction arcs to globe

**File**: `packages/frontend/src/components/globe/GlobeView.tsx`

Add `arcsData` prop to the `<Globe>` component:

```typescript
const conjunctions = useMissionStore((s) => s.conjunctions);
const interConj = conjunctions.filter(c => !c.isIntraConstellation);

// On the <Globe> component:
arcsData={interConj}
arcStartLat={(d: ConjunctionEvent) => d.sat1Position.lat}
arcStartLng={(d: ConjunctionEvent) => d.sat1Position.lng}
arcEndLat={(d: ConjunctionEvent) => d.sat2Position.lat}
arcEndLng={(d: ConjunctionEvent) => d.sat2Position.lng}
arcColor={(d: ConjunctionEvent) => {
    switch (d.severity) {
        case 'CRITICAL': return 'rgba(239, 68, 68, 0.8)';
        case 'WARNING': return 'rgba(249, 115, 22, 0.8)';
        default: return 'rgba(234, 179, 8, 0.5)';
    }
}}
arcStroke={(d: ConjunctionEvent) => d.severity === 'CRITICAL' ? 1.5 : 0.8}
arcDashLength={0.4}
arcDashGap={0.2}
arcDashAnimateTime={1500}
```

### Step 3.4 — Update satellite detail panel

**File**: `packages/frontend/src/components/satellite/SatelliteDetailPanel.tsx`

Add `conjunction` to `BREAKDOWN_LABELS` and `BREAKDOWN_MAX`:

```typescript
const BREAKDOWN_LABELS: Record<string, string> = {
    flareExposure: 'Solar Flare',
    geomagnetic: 'Geomagnetic',
    radiation: 'Radiation',
    solarWind: 'Solar Wind',
    neo: 'NEO Proximity',       // ← updated label
    conjunction: 'Conjunction',  // ← NEW
    compound: 'Compound',
};

const BREAKDOWN_MAX: Record<string, number> = {
    flareExposure: 40,
    geomagnetic: 45,
    radiation: 35,
    solarWind: 15,
    neo: 30,                     // ← was 5
    conjunction: 30,             // ← NEW
    compound: 45,
};
```

Add a "Conjunctions" section below "Active Threats" when the satellite has active conjunctions:

```typescript
{satellite.conjunctions && satellite.conjunctions.length > 0 && (
    <div className="mt-3">
        <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1">
            Active Conjunctions
        </div>
        <ul className="space-y-1">
            {satellite.conjunctions.map((c) => {
                const other = c.sat1Id === satellite.id ? c.sat2Name : c.sat1Name;
                return (
                    <li key={c.id} className="font-mono text-[11px] text-risk-high flex items-start gap-1.5">
                        <span className="shrink-0">&bull;</span>
                        {other} — {c.distanceKm.toFixed(1)} km ({c.severity})
                    </li>
                );
            })}
        </ul>
    </div>
)}
```

### Step 3.5 — Create conjunction list panel

**File**: `packages/frontend/src/components/satellite/ConjunctionListPanel.tsx` (NEW)

A side-panel component showing all active conjunctions in a sortable table. Columns: Sat 1, Sat 2, Distance, Severity, Regime. Filter by severity. Click to center globe on the pair.

### Step 3.6 — Verification

1. Start all three services
2. Open frontend — globe should show arc lines between close-approach pairs
3. Click a satellite with conjunctions — detail panel should show conjunction section
4. Check the conjunction list panel displays and filters correctly

---

## Phase 4: LLM Brief & Polish

### Step 4.1 — Update LLM system prompt

**File**: `packages/agent/src/llmBrief.ts`

Add to the system prompt (around line 69-85):

```
- When conjunction data is provided, assess the collision risk context. Note that
  TLE-based conjunction warnings are proximity alerts, not collision predictions.
  Recommend monitoring or standby for avoidance maneuvers for WARNING/CRITICAL
  conjunctions. Include the satellite pair and distance in your assessment.
- When NEO proximity data shows an asteroid passing near an orbital shell, include
  specific guidance for affected orbit regimes.
```

### Step 4.2 — Update user prompt builder

**File**: `packages/agent/src/llmBrief.ts`

In `buildUserPrompt()` (around line 263-335), add a section that fetches conjunction data from the gateway:

```typescript
// Fetch active conjunctions from gateway
let conjunctionSection = '';
try {
    const conjResp = await axios.get(`${GATEWAY_URL}/internal/active-conjunctions`, {
        timeout: 5_000,
    });
    const conjunctions = conjResp.data.conjunctions;
    if (conjunctions.length > 0) {
        conjunctionSection = '\n## Active Conjunctions (top 5 by severity)\n';
        for (const c of conjunctions.slice(0, 5)) {
            conjunctionSection += `- ${c.sat1Name} <-> ${c.sat2Name}: ${c.distanceKm.toFixed(1)} km (${c.severity}, ${c.sat1Regime})\n`;
        }
    }
} catch {
    // Gateway unreachable — skip conjunction context
}
```

Append `conjunctionSection` to the prompt string.

### Step 4.3 — Update `SatRiskBreakdown.scoring` in Zod schema

**File**: `packages/gateway/src/routes.ts`

The Zod schema for the risk breakdown doesn't need updating because `computeDetailedBreakdown` returns its own shape, not validated by Zod. But ensure the response includes the new `conjunction` field.

### Step 4.4 — Demo mode conjunction data

**File**: `packages/agent/src/demoData.ts`

No changes needed — conjunctions are computed server-side from satellite positions, not from agent demo data. They will appear naturally when satellites happen to be close.

To guarantee demo conjunctions for testing, optionally add a function in `packages/gateway/src/conjunction.ts` that injects synthetic conjunction events when `DEMO_MODE=true`.

### Step 4.5 — End-to-end verification

1. Start all services with `DEMO_MODE=true`
2. Verify NEO proximity scores vary per satellite: `GET /api/satellites/25544/risk` (ISS)
3. Verify conjunctions appear: `GET /api/conjunctions`
4. Verify conjunction arcs on globe
5. Verify LLM brief mentions conjunction data (check gateway logs or `GET /api/agent/brief`)
6. Verify satellite detail panel shows conjunction + updated NEO breakdown bars
7. Run full test suite: `npm test`

---

## File Change Summary

### New Files
| File | Phase | Description |
|------|-------|-------------|
| `packages/gateway/src/conjunction.ts` | 2 | Conjunction detection engine |
| `packages/frontend/src/components/satellite/ConjunctionListPanel.tsx` | 3 | Conjunction list UI |
| `packages/gateway/src/__tests__/conjunction.test.ts` | 2 | Conjunction unit tests |

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `packages/shared/src/types.ts` | 1+2 | Add `NeoProximityDetail`, `ConjunctionEvent`, `ConjunctionSeverity`; extend `SatPosition`, `SatRiskBreakdown` |
| `packages/gateway/src/satRisk.ts` | 1+2 | Replace `scoreNeo` with `scoreNeoProximity`; add conjunction scoring; update compound synergy |
| `packages/agent/src/riskEngine.ts` | 1 | Replace `scoreNeo` with `scoreNeoGlobal` |
| `packages/gateway/src/satellites.ts` | 2 | Add `group` to `TleRecord`; add `propagateAllWithEci()` |
| `packages/gateway/src/index.ts` | 2 | Integrate conjunction detection into broadcast loop; add Socket.io events |
| `packages/gateway/src/routes.ts` | 2 | Add conjunction REST endpoints; extend `RouterDeps` |
| `packages/gateway/prisma/schema.prisma` | 2 | Add `ConjunctionEvent` model |
| `packages/frontend/src/stores/missionStore.ts` | 3 | Add `conjunctions` state |
| `packages/frontend/src/hooks/useSocket.ts` | 3 | Add `conjunction-update` and `conjunction-alerts` listeners |
| `packages/frontend/src/components/globe/GlobeView.tsx` | 3 | Add `arcsData` for conjunction visualization |
| `packages/frontend/src/components/satellite/SatelliteDetailPanel.tsx` | 1+3 | Update `BREAKDOWN_MAX`, add conjunction section |
| `packages/agent/src/llmBrief.ts` | 4 | Update system prompt; add conjunction context to user prompt |
