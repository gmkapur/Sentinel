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
const GROUPS = ['stations', 'active'];
const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2 hours

// ---------------------------------------------------------------------------
// TLE Fetching
// ---------------------------------------------------------------------------

async function fetchTleGroup(group: string): Promise<TleRecord[]> {
    const url = `${CELESTRAK_BASE}?GROUP=${group}&FORMAT=3le`;
    const response = await axios.get<string>(url, {
        timeout: 30_000,
        responseType: 'text',
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
        }
        catch {
            // Skip satellites with unparseable TLEs
        }
    }

    return records;
}

export async function refreshTles(): Promise<void> {
    const results = await Promise.allSettled(
        GROUPS.map((g) => fetchTleGroup(g))
    );

    let added = 0;
    for (const result of results) {
        if (result.status === 'fulfilled') {
            for (const record of result.value) {
                tleCache.set(record.noradId, record);
                added++;
            }
        }
        else {
            console.error('[Satellites] TLE fetch failed:', result.reason?.message ?? result.reason);
        }
    }

    console.log(`[Satellites] TLE cache updated: ${tleCache.size} satellites (${added} processed)`);
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
        }
        catch {
            // Skip satellites with propagation errors
        }
    }

    return positions;
}

// ---------------------------------------------------------------------------
// Single satellite lookup
// ---------------------------------------------------------------------------

export function getSatelliteById(
    noradId: number
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
    }
    catch {
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
    refreshTles().catch((err) =>
        console.error('[Satellites] Initial TLE fetch failed:', err.message ?? err)
    );

    setInterval(() => {
        refreshTles().catch((err) =>
            console.error('[Satellites] TLE refresh failed:', err.message ?? err)
        );
    }, REFRESH_INTERVAL_MS);
}
