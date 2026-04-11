import { useEffect, useState } from 'react';
import { api } from '../services/api';
import { useMissionStore } from '../stores/missionStore';

export function useStatus(): { loading: boolean; error: string | null } {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const initializeFromStatus = useMissionStore((s) => s.initializeFromStatus);

    useEffect(() => {
        let cancelled = false;

        async function fetchInitial() {
            try {
                const data = await api.getStatus();
                if (!cancelled) {
                    initializeFromStatus(data);
                    setLoading(false);
                }
            }
            catch (err) {
                if (!cancelled) {
                    setError(
                        err instanceof Error ? err.message : 'Failed to fetch status'
                    );
                    setLoading(false);
                }
            }
        }

        fetchInitial();
        return () => {
            cancelled = true;
        };
    }, [initializeFromStatus]);

    return { loading, error };
}
