import { useEffect } from 'react';
import { api } from '../services/api';
import { useMissionStore } from '../stores/missionStore';

export function useAlerts(): void {
    const setAlerts = useMissionStore((s) => s.setAlerts);

    useEffect(() => {
        let cancelled = false;

        async function fetchAlerts() {
            try {
                const alerts = await api.getAlerts();
                if (!cancelled) {
                    setAlerts(alerts);
                }
            }
            catch {
                console.warn('Failed to fetch initial alerts');
            }
        }

        fetchAlerts();
        return () => {
            cancelled = true;
        };
    }, [setAlerts]);
}
