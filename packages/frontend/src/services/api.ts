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
};
