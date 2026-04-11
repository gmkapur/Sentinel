import { useEffect, useRef, useState } from 'react';
import { api } from '../services/api';
import { USE_TEMP_DATA_ONLY } from '../config/dataSource';
import { buildTempStatusPayload } from '../mocks/tempFrontendSeed';
import { buildCatalogSatellitePositions } from '../data/satelliteRegistry';
import { DUMMY_WEATHER_EVENTS } from '../mocks/dummyWeatherEvents';
import { useMissionStore } from '../stores/missionStore';

const RETRY_INTERVAL_MS = 3_000;
const MAX_RETRIES = 10;

export function useStatus(): { loading: boolean; error: string | null } {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const initializeFromStatus = useMissionStore((s) => s.initializeFromStatus);
    const setSatellites = useMissionStore((s) => s.setSatellites);
    const setThreatTriangles = useMissionStore((s) => s.setThreatTriangles);
    const retryCount = useRef(0);

    useEffect(() => {
        if (USE_TEMP_DATA_ONLY) {
            initializeFromStatus(buildTempStatusPayload());
            setSatellites(buildCatalogSatellitePositions());
            setThreatTriangles(DUMMY_WEATHER_EVENTS);
            setLoading(false);
            return;
        }

        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        async function fetchInitial() {
            try {
                const data = await api.getStatus();
                if (cancelled) return;

                // Gateway returns null risk/weather when agent hasn't pushed yet — retry
                if (!data.risk || !data.spaceWeather) {
                    if (retryCount.current < MAX_RETRIES) {
                        retryCount.current += 1;
                        retryTimer = setTimeout(fetchInitial, RETRY_INTERVAL_MS);
                    } else {
                        setError('Agent is not yet available. Retrying in the background.');
                        setLoading(false);
                    }
                    return;
                }

                initializeFromStatus(data as Parameters<typeof initializeFromStatus>[0]);

                // Fetch initial satellite positions from REST so the globe
                // populates immediately instead of waiting for the first socket broadcast
                try {
                    const satData = await api.getSatellites();
                    if (!cancelled && satData.satellites.length > 0) {
                        setSatellites(satData.satellites);
                    }
                } catch {
                    // Non-fatal — socket will deliver positions on connect
                }

                // Fetch initial threat triangles
                try {
                    const ttData = await api.getThreatTriangles();
                    if (!cancelled) {
                        setThreatTriangles(ttData.threats);
                    }
                } catch {
                    // Non-fatal — socket will deliver updates on next agent push
                }

                setLoading(false);
            } catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : 'Failed to fetch status',
                    );
                    setLoading(false);
                }
            }
        }

        fetchInitial();
        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
        };
    }, [initializeFromStatus, setSatellites]);

    return { loading, error };
}
