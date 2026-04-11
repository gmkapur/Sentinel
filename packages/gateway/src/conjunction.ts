import { v4 as uuid } from 'uuid';
import type { ConjunctionEvent, ConjunctionSeverity, OrbitRegime } from '@sentinel/shared';
import type { PropagatedSat } from './satellites';
import { classifyOrbit } from './satRisk';
import { logger } from './logger';

const log = logger.child({ component: 'Conjunction' });

// ---------------------------------------------------------------------------
// Altitude bands for coarse filtering (km above Earth's surface)
// ---------------------------------------------------------------------------

type AltBand = 'LEO_LOW' | 'LEO_HIGH' | 'MEO' | 'GEO' | 'HEO';

function getAltBand(altKm: number): AltBand {
    if (altKm < 600) return 'LEO_LOW';
    if (altKm < 2000) return 'LEO_HIGH';
    if (altKm < 35286) return 'MEO';
    if (altKm <= 36286) return 'GEO';
    return 'HEO';
}

// Adjacent bands that should be cross-compared
const ADJACENT_BANDS: Record<AltBand, AltBand[]> = {
    LEO_LOW: ['LEO_LOW', 'LEO_HIGH'],
    LEO_HIGH: ['LEO_LOW', 'LEO_HIGH', 'MEO'],
    MEO: ['LEO_HIGH', 'MEO', 'GEO'],
    GEO: ['MEO', 'GEO', 'HEO'],
    HEO: ['GEO', 'HEO'],
};

// ---------------------------------------------------------------------------
// Regime-specific distance thresholds (km)
// ---------------------------------------------------------------------------

function getThreshold(regime: OrbitRegime): number {
    switch (regime) {
        case 'LEO': return 25;
        case 'MEO': return 50;
        case 'GEO': return 100;
        case 'HEO': return 50;
    }
}

function classifySeverity(distanceKm: number, threshold: number): ConjunctionSeverity {
    if (distanceKm < threshold / 5) return 'CRITICAL';
    if (distanceKm < threshold / 2) return 'WARNING';
    return 'CLOSE_APPROACH';
}

// ---------------------------------------------------------------------------
// Deduplication — max 1 alert per unique pair per 5 minutes
// ---------------------------------------------------------------------------

const DEDUP_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Key: "minId:maxId", Value: last alert timestamp
const dedupMap = new Map<string, number>();

function pairKey(id1: number, id2: number): string {
    return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
}

function shouldAlert(id1: number, id2: number, now: number): boolean {
    const key = pairKey(id1, id2);
    const lastAlert = dedupMap.get(key);
    if (lastAlert && now - lastAlert < DEDUP_WINDOW_MS) {
        return false;
    }
    dedupMap.set(key, now);
    return true;
}

// Periodic cleanup of stale dedup entries
function cleanupDedupMap(now: number): void {
    for (const [key, ts] of dedupMap) {
        if (now - ts > DEDUP_WINDOW_MS * 2) {
            dedupMap.delete(key);
        }
    }
}

// ---------------------------------------------------------------------------
// 3D Euclidean distance using ECI vectors (km)
// ---------------------------------------------------------------------------

function eciDistance(a: PropagatedSat, b: PropagatedSat): number {
    const dx = a.eciX - b.eciX;
    const dy = a.eciY - b.eciY;
    const dz = a.eciZ - b.eciZ;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// ---------------------------------------------------------------------------
// Main detection function
// ---------------------------------------------------------------------------

export interface ConjunctionResult {
    /** All active conjunctions (including intra-constellation) */
    all: ConjunctionEvent[];
    /** Only new inter-constellation WARNING/CRITICAL events (for alerts) */
    newAlerts: ConjunctionEvent[];
}

export function detectConjunctions(satellites: PropagatedSat[]): ConjunctionResult {
    const now = Date.now();
    const timestamp = new Date(now).toISOString();

    // Phase 1: Bucket satellites by altitude band
    const buckets = new Map<AltBand, PropagatedSat[]>();
    for (const sat of satellites) {
        const band = getAltBand(sat.alt);
        let bucket = buckets.get(band);
        if (!bucket) {
            bucket = [];
            buckets.set(band, bucket);
        }
        bucket.push(sat);
    }

    // Phase 2: Pairwise comparison within same + adjacent bands
    const all: ConjunctionEvent[] = [];
    const newAlerts: ConjunctionEvent[] = [];
    const checkedPairs = new Set<string>();

    for (const [band, sats] of buckets) {
        const adjacentBands = ADJACENT_BANDS[band];

        for (const adjBand of adjacentBands) {
            const adjSats = buckets.get(adjBand);
            if (!adjSats) continue;

            // For same-band comparison, avoid double-checking
            const isSameBand = band === adjBand;

            for (let i = 0; i < sats.length; i++) {
                const sat1 = sats[i];
                const startJ = isSameBand ? i + 1 : 0;
                const targetArr = isSameBand ? sats : adjSats;

                for (let j = startJ; j < targetArr.length; j++) {
                    const sat2 = targetArr[j];
                    if (sat1.id === sat2.id) continue;

                    // Skip if already checked this pair
                    const pk = pairKey(sat1.id, sat2.id);
                    if (checkedPairs.has(pk)) continue;
                    checkedPairs.add(pk);

                    const dist = eciDistance(sat1, sat2);

                    // Use the stricter (smaller) threshold of the two regimes
                    const regime1 = classifyOrbit(sat1.alt);
                    const regime2 = classifyOrbit(sat2.alt);
                    const threshold = Math.min(getThreshold(regime1), getThreshold(regime2));

                    if (dist >= threshold) continue;

                    const severity = classifySeverity(dist, threshold);
                    const isIntraConstellation = sat1.group === sat2.group;

                    const event: ConjunctionEvent = {
                        id: uuid(),
                        sat1Id: sat1.id,
                        sat1Name: sat1.name,
                        sat2Id: sat2.id,
                        sat2Name: sat2.name,
                        distanceKm: Math.round(dist * 100) / 100,
                        severity,
                        isIntraConstellation,
                        sat1Regime: regime1,
                        sat2Regime: regime2,
                        sat1Position: { lat: sat1.lat, lng: sat1.lng, alt: sat1.alt },
                        sat2Position: { lat: sat2.lat, lng: sat2.lng, alt: sat2.alt },
                        timestamp,
                    };

                    all.push(event);

                    // Only alert for inter-constellation WARNING/CRITICAL with dedup
                    if (
                        !isIntraConstellation &&
                        (severity === 'WARNING' || severity === 'CRITICAL') &&
                        shouldAlert(sat1.id, sat2.id, now)
                    ) {
                        newAlerts.push(event);
                    }
                }
            }
        }
    }

    // Periodic dedup cleanup
    if (Math.random() < 0.1) {
        cleanupDedupMap(now);
    }

    if (all.length > 0) {
        log.info(
            {
                total: all.length,
                interConstellation: all.filter((c) => !c.isIntraConstellation).length,
                newAlerts: newAlerts.length,
                bySeverity: {
                    CRITICAL: all.filter((c) => c.severity === 'CRITICAL').length,
                    WARNING: all.filter((c) => c.severity === 'WARNING').length,
                    CLOSE_APPROACH: all.filter((c) => c.severity === 'CLOSE_APPROACH').length,
                },
            },
            'Conjunction detection complete',
        );
    }

    return { all, newAlerts };
}

// ---------------------------------------------------------------------------
// State — latest conjunction results accessible from routes
// ---------------------------------------------------------------------------

let latestConjunctions: ConjunctionEvent[] = [];

export function setLatestConjunctions(conjunctions: ConjunctionEvent[]): void {
    latestConjunctions = conjunctions;
}

export function getLatestConjunctions(): ConjunctionEvent[] {
    return latestConjunctions;
}
