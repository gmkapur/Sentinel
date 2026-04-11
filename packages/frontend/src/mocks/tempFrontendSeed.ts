import type {
    MissionBrief,
    RiskState,
    SatPosition,
    SpaceWeatherState,
} from '@sentinel/shared/src/types';
import {
    ORBITAL_REGISTRY_CANON_TOTAL,
    altitudeKmForClass,
    registryClassFromIndex,
} from '../utils/orbitalRegistry';

export interface TempStatusPayload {
    risk: RiskState;
    brief: MissionBrief | null;
    spaceWeather: SpaceWeatherState;
    satelliteCount: number;
    lastAgentUpdate: string;
}

function isoNow(): string {
    return new Date().toISOString();
}

const breakdown = {
    flare: 12,
    geomagnetic: 18,
    radiation: 14,
    solarWind: 10,
    imfBz: 8,
    neo: 4,
    cmePath: 0,
    compound: 22,
};

export function buildTempStatusPayload(): TempStatusPayload {
    const ts = isoNow();
    return {
        risk: {
            score: 22,
            level: 'LOW',
            breakdown: { ...breakdown },
            timestamp: ts,
        },
        brief: {
            recommendation: 'GO',
            summary:
                'Catalog spans LEO through GEO, crewed stations, debris clouds, and deep-space probes. Nominal satellite-risk profile on the temp window.',
            threats: ['None in demo window'],
            maneuverWindows: ['N/A — temp data'],
            confidence: 92,
            generatedAt: ts,
            isLlm: false,
        },
        spaceWeather: {
            xrayClass: 'B2.1',
            kpIndex: 3,
            protonFlux: 1.2,
            solarWindSpeed: 438,
            bz: -1.8,
            timestamp: ts,
        },
        satelliteCount: ORBITAL_REGISTRY_CANON_TOTAL,
        lastAgentUpdate: ts,
    };
}

/** Deterministic multi-regime dots for the globe (temp only). */
export function buildTempSatellitePositions(count = 220): SatPosition[] {
    const out: SatPosition[] = [];
    for (let i = 0; i < count; i += 1) {
        const lat = Math.max(-85, Math.min(85, Math.sin(i * 0.31) * 72 + (i % 7)));
        const lng = ((((i * 97) % 360) + 180) % 360) - 180;
        const registryClass = registryClassFromIndex(i, count);
        const alt = altitudeKmForClass(registryClass, i);
        const name =
            registryClass === 'STATION'
                ? i % 2 === 0
                    ? 'ISS'
                    : 'TIANGONG'
                : registryClass === 'DEBRIS'
                  ? `DEB-${19_700 + (i % 500)}`
                  : registryClass === 'DEEPSPACE'
                    ? `DS-${String(i).padStart(3, '0')}`
                    : `CAT-${String(i).padStart(4, '0')}`;
        out.push({
            id: 50_000 + i,
            name,
            lat,
            lng,
            alt,
            registryClass,
        });
    }
    return out;
}
