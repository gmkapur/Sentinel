import type { OrbitalRegistryClass } from '@sentinel/shared/src/types';

/** Canonical public demo breakdown (full orbital ecosystem). */
export const ORBITAL_REGISTRY_CANON = {
    leo: 10_540,
    meo: 122,
    geo: 591,
    stations: 2,
    debris: 38_700,
} as const;

export const ORBITAL_REGISTRY_CANON_TOTAL =
    ORBITAL_REGISTRY_CANON.leo
    + ORBITAL_REGISTRY_CANON.meo
    + ORBITAL_REGISTRY_CANON.geo
    + ORBITAL_REGISTRY_CANON.stations
    + ORBITAL_REGISTRY_CANON.debris;

export type OrbitalRegistryCounts = {
    leo: number;
    meo: number;
    geo: number;
    stations: number;
    debris: number;
    total: number;
};

/**
 * Scale category counts from a single catalog total (e.g. API `satelliteCount`)
 * while preserving the canonical mix. Rounding error is absorbed into LEO.
 */
export function deriveRegistryFromCatalogTotal(
    catalogTotal: number
): OrbitalRegistryCounts {
    if (!Number.isFinite(catalogTotal) || catalogTotal <= 0) {
        return {
            leo: 0,
            meo: 0,
            geo: 0,
            stations: 0,
            debris: 0,
            total: 0,
        };
    }

    const t = Math.round(catalogTotal);
    const w = ORBITAL_REGISTRY_CANON;
    const sumW = ORBITAL_REGISTRY_CANON_TOTAL;

    let leo = Math.round((t * w.leo) / sumW);
    let meo = Math.round((t * w.meo) / sumW);
    let geo = Math.round((t * w.geo) / sumW);
    let stations = Math.round((t * w.stations) / sumW);
    let debris = Math.round((t * w.debris) / sumW);

    stations = Math.max(stations, t > 0 ? 1 : 0);
    meo = Math.max(meo, 0);
    geo = Math.max(geo, 0);
    debris = Math.max(debris, 0);
    leo = Math.max(leo, 0);

    const s = leo + meo + geo + stations + debris;
    const drift = t - s;
    leo = Math.max(0, leo + drift);

    return {
        leo,
        meo,
        geo,
        stations,
        debris,
        total: leo + meo + geo + stations + debris,
    };
}

/** Class for a deterministic temp dot from index (stable mix on the globe). */
export function registryClassFromIndex(i: number, _total: number): OrbitalRegistryClass {
    if (i % 103 === 0) return 'STATION';
    const u = ((i * 7919) % 1000) / 1000;
    if (u < 0.48) return 'LEO';
    if (u < 0.66) return 'DEBRIS';
    if (u < 0.76) return 'MEO';
    if (u < 0.84) return 'GEO';
    return 'DEEPSPACE';
}

export function altitudeKmForClass(c: OrbitalRegistryClass, i: number): number {
    switch (c) {
        case 'LEO':
            return 220 + (i % 95) * 18;
        case 'DEBRIS':
            return 580 + (i % 55) * 22;
        case 'MEO':
            return 3200 + (i % 800) * 24;
        case 'GEO':
            return 35_786 + (i % 12) * 0.05;
        case 'STATION':
            return i % 2 === 0 ? 408 : 389;
        case 'DEEPSPACE':
        default:
            return 65_000 + (i % 200) * 420;
    }
}
