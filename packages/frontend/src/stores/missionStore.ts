import { create } from 'zustand';
import { useMemo } from 'react';
import type {
    RiskState,
    RiskLevel,
    SpaceWeatherState,
    MissionBrief,
    SatPosition,
    AlertRecord,
} from '@sentinel/shared/src/types';

interface ConnectionState {
    connected: boolean;
    lastUpdate: string | null;
}

interface MissionStore {
    risk: RiskState | null;
    weather: SpaceWeatherState | null;
    brief: MissionBrief | null;
    satellites: SatPosition[];
    satelliteCount: number;
    alerts: AlertRecord[];
    connection: ConnectionState;

    setRisk: (risk: RiskState) => void;
    setWeather: (weather: SpaceWeatherState) => void;
    setBrief: (brief: MissionBrief | null) => void;
    setSatellites: (satellites: SatPosition[]) => void;
    setSatelliteCount: (count: number) => void;
    addAlert: (alert: AlertRecord) => void;
    setAlerts: (alerts: AlertRecord[]) => void;
    setConnected: (connected: boolean) => void;
    setLastUpdate: (timestamp: string) => void;
    initializeFromStatus: (data: {
        risk: RiskState;
        brief: MissionBrief | null;
        spaceWeather: SpaceWeatherState;
        satelliteCount: number;
        lastAgentUpdate: string;
    }) => void;
}

export const useMissionStore = create<MissionStore>((set) => ({
    risk: null,
    weather: null,
    brief: null,
    satellites: [],
    satelliteCount: 0,
    alerts: [],
    connection: { connected: false, lastUpdate: null },

    setRisk: (risk) => set({ risk }),
    setWeather: (weather) => set({ weather }),
    setBrief: (brief) => set({ brief }),
    setSatellites: (satellites) => set({ satellites }),
    setSatelliteCount: (count) => set({ satelliteCount: count }),
    addAlert: (alert) =>
        set((state) => ({
            alerts: [alert, ...state.alerts].slice(0, 100),
        })),
    setAlerts: (alerts) => set({ alerts }),
    setConnected: (connected) =>
        set((state) => ({
            connection: { ...state.connection, connected },
        })),
    setLastUpdate: (timestamp) =>
        set((state) => ({
            connection: { ...state.connection, lastUpdate: timestamp },
        })),
    initializeFromStatus: (data) =>
        set({
            risk: data.risk,
            brief: data.brief,
            weather: data.spaceWeather,
            satelliteCount: data.satelliteCount,
            connection: {
                connected: true,
                lastUpdate: data.lastAgentUpdate,
            },
        }),
}));

// ---------------------------------------------------------------------------
// Derived selectors
// ---------------------------------------------------------------------------

export function useTopRiskSatellites(count = 10): SatPosition[] {
    const satellites = useMissionStore((s) => s.satellites);
    return useMemo(
        () =>
            [...satellites]
                .filter((s) => (s.riskScore ?? 0) > 0)
                .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
                .slice(0, count),
        [satellites, count],
    );
}

export function useRiskDistribution(): Record<RiskLevel, number> {
    const satellites = useMissionStore((s) => s.satellites);
    return useMemo(() => {
        const dist: Record<RiskLevel, number> = {
            CRITICAL: 0,
            HIGH: 0,
            MODERATE: 0,
            LOW: 0,
        };
        for (const s of satellites) {
            const lvl = s.riskLevel ?? 'LOW';
            dist[lvl]++;
        }
        return dist;
    }, [satellites]);
}
