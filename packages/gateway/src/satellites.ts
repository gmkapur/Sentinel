import axios from 'axios';
import * as satellite from 'satellite.js';

import type { SatPosition } from '@sentinel/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TleRecord {
    noradId: number;
    name: string;
    line1: string;
    line2: string;
    satrec: satellite.SatRec;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const tleCache = new Map<number, TleRecord>();

const CELESTRAK_BASE = 'https://celestrak.org/NORAD/elements/gp.php';
// Use several smaller groups instead of 'active' (which CelesTrak 403s for bulk downloads).
// These together yield 200+ unique satellites across key constellations and orbits.
const GROUPS = [
    'stations', // ~15  — ISS, Tiangong, crew/cargo vehicles
    'weather', // ~50  — NOAA, EUMETSAT, DMSP weather sats
    'resource', // ~40  — Earth observation (Landsat, Sentinel, etc.)
    'geo', // ~500 — Geostationary belt
    'iridium', // ~75  — Iridium NEXT constellation
    'starlink', // ~100+ — Starlink (partial, recent launches)
    'globalstar', // ~24  — Globalstar constellation
    'gps-ops', // ~31  — GPS operational constellation
    'galileo', // ~28  — Galileo GNSS
];
const FETCH_TIMEOUT_MS = 60_000; // 60s for larger groups
const MAX_RETRIES = 3;
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// Retry helper
// ---------------------------------------------------------------------------

async function fetchWithRetry<T>(
    fn: () => Promise<T>,
    label: string,
): Promise<T> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (attempt === MAX_RETRIES) {
                throw err;
            }
            const backoffMs = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
            console.warn(
                `[Satellites] ${label} attempt ${attempt}/${MAX_RETRIES} failed (${msg}), retrying in ${backoffMs}ms…`,
            );
            await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }
    }
    // Unreachable, but satisfies TypeScript
    throw new Error(`${label} failed after ${MAX_RETRIES} retries`);
}

// ---------------------------------------------------------------------------
// TLE Fetching (3LE format — name + two TLE lines per satellite)
// ---------------------------------------------------------------------------

async function fetchTleGroup(group: string): Promise<TleRecord[]> {
    const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=3le`;
    const response = await axios.get<string>(url, {
        timeout: FETCH_TIMEOUT_MS,
        responseType: 'text',
        headers: {
            'User-Agent':
                'OrbitSentinel/1.0 (space-situational-awareness; contact@orbsentinel.dev)',
        },
    });

    const lines = response.data.trim().split('\n');
    const records: TleRecord[] = [];

    for (let i = 0; i + 2 < lines.length; i += 3) {
        const name = lines[i].trim();
        const line1 = lines[i + 1].trim();
        const line2 = lines[i + 2].trim();

        if (!line1.startsWith('1') || !line2.startsWith('2')) {
            continue;
        }

        const noradId = parseInt(line2.substring(2, 7).trim(), 10);
        if (isNaN(noradId)) {
            continue;
        }

        try {
            const satrec = satellite.twoline2satrec(line1, line2);
            records.push({ noradId, name, line1, line2, satrec });
        } catch {
            // Skip satellites with unparseable TLEs
        }
    }

    return records;
}

export async function refreshTles(): Promise<void> {
    const results = await Promise.allSettled(
        GROUPS.map((g) => fetchWithRetry(() => fetchTleGroup(g), `group:${g}`)),
    );

    let added = 0;
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'fulfilled') {
            for (const record of result.value) {
                tleCache.set(record.noradId, record);
                added++;
            }
            console.log(
                `[Satellites] ${GROUPS[i]}: ${result.value.length} satellites loaded`,
            );
        } else {
            console.error(
                `[Satellites] ${GROUPS[i]} fetch failed after ${MAX_RETRIES} retries:`,
                result.reason?.message ?? result.reason,
            );
        }
    }

    console.log(
        `[Satellites] TLE cache updated: ${tleCache.size} satellites (${added} processed)`,
    );
}

// ---------------------------------------------------------------------------
// SGP4 Propagation
// ---------------------------------------------------------------------------

export function propagateAll(): SatPosition[] {
    const now = new Date();
    const gmst = satellite.gstime(now);
    const positions: SatPosition[] = [];

    for (const [, record] of tleCache) {
        try {
            const posVel = satellite.propagate(record.satrec, now);

            const position = posVel.position;
            if (!position || typeof position === 'boolean') {
                continue;
            }

            const geo = satellite.eciToGeodetic(position, gmst);
            positions.push({
                id: record.noradId,
                name: record.name,
                lat: satellite.degreesLat(geo.latitude),
                lng: satellite.degreesLong(geo.longitude),
                alt: geo.height,
            });
        } catch {
            // Skip satellites with propagation errors
        }
    }

    return positions;
}

// ---------------------------------------------------------------------------
// Single satellite lookup
// ---------------------------------------------------------------------------

export function getSatelliteById(
    noradId: number,
): (SatPosition & { line1: string; line2: string }) | null {
    const record = tleCache.get(noradId);
    if (!record) {
        return null;
    }

    const now = new Date();
    const gmst = satellite.gstime(now);

    try {
        const posVel = satellite.propagate(record.satrec, now);

        const position = posVel.position;
        if (!position || typeof position === 'boolean') {
            return null;
        }

        const geo = satellite.eciToGeodetic(position, gmst);
        return {
            id: record.noradId,
            name: record.name,
            lat: satellite.degreesLat(geo.latitude),
            lng: satellite.degreesLong(geo.longitude),
            alt: geo.height,
            line1: record.line1,
            line2: record.line2,
        };
    } catch {
        return null;
    }
}

// ---------------------------------------------------------------------------
// Satellite count
// ---------------------------------------------------------------------------

export function getSatelliteCount(): number {
    return tleCache.size;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startTleRefreshLoop(): void {
    setInterval(() => {
        refreshTles().catch((err) =>
            console.error(
                '[Satellites] TLE refresh failed:',
                err.message ?? err,
            ),
        );
    }, REFRESH_INTERVAL_MS);
}
