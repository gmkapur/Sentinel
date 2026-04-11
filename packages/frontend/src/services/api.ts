import { USE_TEMP_DATA_ONLY } from '../config/dataSource';
import type { OrbitSuggestionApiResponse } from '../types/orbitSuggestion';
import type { ThreatTriangle } from '../stores/missionStore';
import type {
    RiskState,
    SpaceWeatherState,
    MissionBrief,
    SatPosition,
    AlertRecord,
    NarrationRequest,
} from '@sentinel/shared/src/types';

export interface StatusResponse {
    risk: RiskState | null;
    brief: MissionBrief | null;
    spaceWeather: SpaceWeatherState | null;
    satelliteCount: number;
    lastAgentUpdate: string | null;
}

export interface SatellitesResponse {
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
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
    getStatus: () => fetchJson<StatusResponse>('/api/v1/status'),
    getSatellites: (page = 1) =>
        fetchJson<SatellitesResponse>(`/api/v1/satellites?page=${page}`),
    getAlerts: () => fetchJson<AlertRecord[]>('/api/v1/alerts'),
    getSpaceWeather: () => fetchJson<SpaceWeatherState>('/api/v1/space-weather'),
    getBrief: () => fetchJson<MissionBrief>('/api/v1/agent/brief'),
    regenerateBrief: () =>
        fetchJson<MissionBrief>('/api/v1/agent/brief', { method: 'POST' }),
    getAgentHealth: () => fetchJson<any>('/api/v1/agent/health'),
    getThreatTriangles: () =>
        fetchJson<{ threats: ThreatTriangle[] }>('/api/v1/threat-triangles'),
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
        const res = await fetch('/api/v1/agent/orbit-suggestion', {
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

    forceCall: async () => {
        const res = await fetch('/api/v1/agent/force-call', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
        });
        let data: { message?: string; riskLevel?: string; score?: number; error?: string } = {};
        try {
            data = (await res.json()) as typeof data;
        } catch {
            /* non-JSON error body */
        }
        if (!res.ok) {
            throw new Error(data.error || `Force call failed: ${res.status}`);
        }
        return data;
    },

    /** Returns a raw Response whose body is a streaming audio/mpeg. Caller handles abort. */
    narrate: (req: NarrationRequest, signal?: AbortSignal): Promise<Response> =>
        fetch('/api/v1/narrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(req),
            signal,
        }),

    postCall: async (body: { to?: string; test?: boolean }) => {
        const res = await fetch('/api/v1/agent/test-call', {
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
