import type { OrbitalRegistryClass, SatPosition } from '@sentinel/shared/src/types';
import type { SimCinematicEvent } from '../mocks/simCinematicEvents';

export interface CatalogSatellite {
    id: string;
    type: string;
    altitudeKm: number;
    lat: number;
    lng: number;
    operator: string | null;
    status: string;
}

function generateSatellites(): CatalogSatellite[] {
    const satellites: CatalogSatellite[] = [];

    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2;
        const inclinationVariance = (Math.random() - 0.5) * 120;
        satellites.push({
            id: `STARLINK-${4800 + i}`,
            type: 'LEO',
            altitudeKm: 400 + Math.random() * 1600,
            lat: inclinationVariance,
            lng: (angle * 180) / Math.PI + (Math.random() - 0.5) * 30,
            operator: i % 3 === 0 ? 'Planet Labs' : i % 3 === 1 ? 'Spire Global' : 'SpaceX',
            status: 'NOMINAL',
        });
    }

    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        satellites.push({
            id: i < 10 ? `GPS-BIIR-${i + 1}` : `GALILEO-FOC-${i - 9}`,
            type: 'MEO',
            altitudeKm: 20200 + Math.random() * 3800,
            lat: (Math.random() - 0.5) * 110,
            lng: (angle * 180) / Math.PI + (Math.random() - 0.5) * 20,
            operator: i < 10 ? 'USSF' : 'ESA',
            status: 'NOMINAL',
        });
    }

    for (let i = 0; i < 15; i++) {
        const angle = (i / 15) * Math.PI * 2;
        satellites.push({
            id: `INTELSAT-${30 + i}`,
            type: 'GEO',
            altitudeKm: 35786,
            lat: (Math.random() - 0.5) * 4,
            lng: (angle * 180) / Math.PI,
            operator: i % 2 === 0 ? 'Intelsat' : 'SES',
            status: 'NOMINAL',
        });
    }

    satellites.push(
        {
            id: 'ISS',
            type: 'STATION',
            altitudeKm: 408,
            lat: 28.5,
            lng: -80.6,
            operator: 'NASA',
            status: 'NOMINAL',
        },
        {
            id: 'TIANGONG',
            type: 'STATION',
            altitudeKm: 389,
            lat: 41.9,
            lng: 116.4,
            operator: 'CNSA',
            status: 'NOMINAL',
        },
        {
            id: 'CSS-NODE',
            type: 'STATION',
            altitudeKm: 420,
            lat: 35.0,
            lng: 45.0,
            operator: 'AXIOM',
            status: 'NOMINAL',
        }
    );

    satellites.push(
        {
            id: 'DEBRIS-19742',
            type: 'DEBRIS',
            altitudeKm: 789,
            lat: 52.1,
            lng: -148.3,
            operator: null,
            status: 'THREAT',
        },
        {
            id: 'DEBRIS-KOS1408-A',
            type: 'DEBRIS',
            altitudeKm: 490,
            lat: 65.4,
            lng: 74.2,
            operator: null,
            status: 'THREAT',
        }
    );

    return satellites;
}

export const SATELLITE_REGISTRY: CatalogSatellite[] = generateSatellites();

function typeToRegistryClass(t: string): OrbitalRegistryClass {
    switch (t) {
        case 'MEO':
            return 'MEO';
        case 'GEO':
            return 'GEO';
        case 'STATION':
            return 'STATION';
        case 'DEBRIS':
            return 'DEBRIS';
        case 'LEO':
        default:
            return 'LEO';
    }
}

/** Stable numeric id for store / socket payloads. */
export function catalogIdToNumber(id: string): number {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
        h = (Math.imul(31, h) + id.charCodeAt(i)) | 0;
    }
    return Math.abs(h) % 2_000_000_000;
}

export function catalogSatelliteToPosition(c: CatalogSatellite): SatPosition {
    return {
        id: catalogIdToNumber(c.id),
        name: c.id,
        lat: c.lat,
        lng: c.lng,
        alt: c.altitudeKm,
        registryClass: typeToRegistryClass(c.type),
    };
}

export function buildCatalogSatellitePositions(): SatPosition[] {
    return SATELLITE_REGISTRY.map(catalogSatelliteToPosition);
}

export function getCatalogSatelliteById(id: string): CatalogSatellite | undefined {
    return SATELLITE_REGISTRY.find((s) => s.id === id);
}

/**
 * Primary satellite for the cinematic: first `assetsAffected` entry in registry,
 * else nearest catalog object to event lat/lng at similar altitude.
 */
export function resolveSimTargetSatellite(ev: SimCinematicEvent): CatalogSatellite {
    for (const aid of ev.assetsAffected) {
        if (aid.includes('through') || aid.toUpperCase().includes('FULL')) continue;
        const hit = getCatalogSatelliteById(aid);
        if (hit) return hit;
    }
    let best: CatalogSatellite = SATELLITE_REGISTRY[0];
    let bestD = Infinity;
    for (const s of SATELLITE_REGISTRY) {
        if (s.type === 'DEBRIS') continue;
        const d =
            Math.abs(s.lat - ev.lat)
            + Math.abs(s.lng - ev.lng) / 3
            + Math.abs(s.altitudeKm - ev.orbitAltitudeKm) / 5000;
        if (d < bestD) {
            bestD = d;
            best = s;
        }
    }
    return best;
}

/** Satellites to tint as at-risk during sim (subset of assetsAffected). */
export function resolveAtRiskSatelliteNames(ev: SimCinematicEvent): string[] {
    const names: string[] = [];
    for (const aid of ev.assetsAffected) {
        if (getCatalogSatelliteById(aid)) names.push(aid);
    }
    if (names.length === 0) names.push(resolveSimTargetSatellite(ev).id);
    return names;
}
