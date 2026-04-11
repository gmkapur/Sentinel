import { USE_TEMP_DATA_ONLY } from '../config/dataSource';
import type { OrbitSuggestionApiResponse } from '../types/orbitSuggestion';
import type {
    RiskState,
    SpaceWeatherState,
    MissionBrief,
    SatPosition,
    AlertRecord,
} from '@sentinel/shared/src/types';

export interface StatusResponse {
    risk: RiskState;
    brief: MissionBrief | null;
    spaceWeather: SpaceWeatherState;
    satelliteCount: number;
    lastAgentUpdate: string;
}

export interface SatellitesResponse {
    count: number;
    satellites: SatPosition[];
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
}

export const api = {
    getStatus: () => fetchJson<StatusResponse>('/api/status'),
    getSatellites: () => fetchJson<SatellitesResponse>('/api/satellites'),
    getAlerts: () => fetchJson<AlertRecord[]>('/api/alerts'),
    getSpaceWeather: () => fetchJson<SpaceWeatherState>('/api/space-weather'),
    getBrief: () => fetchJson<MissionBrief>('/api/agent/brief'),
    regenerateBrief: () =>
        fetchJson<MissionBrief>('/api/agent/brief', { method: 'POST' }),
    getAgentHealth: () => fetchJson<any>('/api/agent/health'),
    postOrbitSuggestion: async (body: unknown): Promise<OrbitSuggestionApiResponse> => {
        if (USE_TEMP_DATA_ONLY) {
            return {
                suggestion: {
                    recommendation:
                        'Raise altitude with a prograde burn to increase separation from the modeled threat corridor while monitoring conjunctions.',
                    maneuver: {
                        type: 'altitude_raise',
                        deltaAltitudeKm: 95,
                        deltaInclination: 0,
                        burnDurationSeconds: 38,
                        thrustDirection: 'prograde',
                        urgencyHours: 6,
                    },
                    newOrbit: {
                        altitudeKm: 645,
                        inclination: 53,
                        safetyMarginKm: 220,
                    },
                    costOfManeuver: 'LOW  ··  ~2% propellant reserve (offline demo)',
                    riskIfIgnored: 'Continued corridor exposure increases charging and SEU probability.',
                },
                newOrbit: {
                    altitudeKm: 645,
                    inclination: 53,
                    safetyMarginKm: 220,
                },
            };
        }
        const res = await fetch('/api/orbit-suggestion', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const data = (await res.json()) as OrbitSuggestionApiResponse & { error?: string };
        if (!res.ok) {
            throw new Error(data.error || `Orbit suggestion failed: ${res.status}`);
        }
        return data;
    },

    postCall: async (body: { to?: string; test?: boolean }) => {
        if (USE_TEMP_DATA_ONLY) {
            return { ok: true as const, sid: 'TEMP_DATA_NO_CALL' };
        }

        const res = await fetch('/api/call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        let data: { ok?: boolean; sid?: string; error?: string } = {};
        try {
            data = (await res.json()) as typeof data;
        }
        catch {
            /* non-JSON error body */
        }
        if (!res.ok) {
            throw new Error(data.error || `Call failed: ${res.status}`);
        }
        return data as { ok: boolean; sid?: string };
    },
};
