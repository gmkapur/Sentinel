import type {
    RiskState,
    SpaceWeatherState,
    MissionBrief,
    SatPosition,
    SatRiskBreakdown,
    SatRiskSummary,
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
    getStatus: () => fetchJson<StatusResponse>('/api/v1/status'),
    getSatellites: () => fetchJson<SatellitesResponse>('/api/v1/satellites'),
    getAlerts: () => fetchJson<AlertRecord[]>('/api/v1/alerts'),
    getSpaceWeather: () => fetchJson<SpaceWeatherState>('/api/v1/space-weather'),
    getBrief: () => fetchJson<MissionBrief>('/api/v1/agent/brief'),
    regenerateBrief: () =>
        fetchJson<MissionBrief>('/api/v1/agent/brief', { method: 'POST' }),
    getAgentHealth: () => fetchJson<any>('/api/v1/agent/health'),
    getSatelliteRisk: (noradId: number) =>
        fetchJson<SatRiskBreakdown>(`/api/v1/satellites/${noradId}/risk`),
    getTopRiskSatellites: (count = 20) =>
        fetchJson<{ count: number; satellites: SatRiskSummary[] }>(
            `/api/v1/satellites/top-risk?count=${count}`,
        ),
    getRiskStats: () =>
        fetchJson<{
            total: number;
            byLevel: Record<string, number>;
            byRegime: Record<string, number>;
            topRisk: SatRiskSummary[];
            timestamp: string;
        }>('/api/v1/satellites/risk-stats'),
};
