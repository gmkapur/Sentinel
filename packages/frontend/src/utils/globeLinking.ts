import type { SatPosition } from '@sentinel/shared/src/types';
import type { ThreatTriangle } from '../stores/missionStore';

/** Great-circle angular distance (degrees) between subsatellite / surface points. */
export function surfaceAngularDistanceDeg(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
): number {
    const toRad = (d: number) => (d * Math.PI) / 180;
    const φ1 = toRad(lat1);
    const φ2 = toRad(lat2);
    const Δφ = toRad(lat2 - lat1);
    const Δλ = toRad(lng2 - lng1);
    const a =
        Math.sin(Δφ / 2) ** 2
        + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return (c * 180) / Math.PI;
}

const AFFECTED_DEG = 26;
const POTENTIAL_DEG = 48;

export function satellitesLinkedToWeather(
    lat: number,
    lng: number,
    sats: SatPosition[],
    opts?: { maxAffected?: number; maxPotential?: number }
): { affected: string[]; potential: string[] } {
    const maxA = opts?.maxAffected ?? 14;
    const maxP = opts?.maxPotential ?? 12;
    const scored = sats
        .map((s) => ({
            name: s.name,
            d: surfaceAngularDistanceDeg(lat, lng, s.lat, s.lng),
        }))
        .filter((x) => x.d < POTENTIAL_DEG)
        .sort((a, b) => a.d - b.d);

    const affected = scored
        .filter((x) => x.d < AFFECTED_DEG)
        .slice(0, maxA)
        .map((x) => x.name);
    const affectedSet = new Set(affected);
    const potential = scored
        .filter((x) => x.d >= AFFECTED_DEG && x.d < POTENTIAL_DEG && !affectedSet.has(x.name))
        .slice(0, maxP)
        .map((x) => x.name);
    return { affected, potential };
}

export function weatherLinkedToSatellite(
    sat: SatPosition,
    events: ThreatTriangle[],
    opts?: { maxAffected?: number; maxPotential?: number }
): { affected: string[]; potential: string[] } {
    const maxA = opts?.maxAffected ?? 5;
    const maxP = opts?.maxPotential ?? 8;
    const scored = events
        .map((e) => ({
            id: e.id,
            d: surfaceAngularDistanceDeg(sat.lat, sat.lng, e.lat, e.lng),
        }))
        .filter((x) => x.d < POTENTIAL_DEG)
        .sort((a, b) => a.d - b.d);

    const affected = scored
        .filter((x) => x.d < AFFECTED_DEG)
        .slice(0, maxA)
        .map((x) => x.id);
    const affectedSet = new Set(affected);
    const potential = scored
        .filter((x) => x.d >= AFFECTED_DEG && x.d < POTENTIAL_DEG && !affectedSet.has(x.id))
        .slice(0, maxP)
        .map((x) => x.id);
    return { affected, potential };
}
