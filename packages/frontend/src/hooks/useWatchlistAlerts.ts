import { useEffect, useRef } from 'react';
import { useMissionStore } from '../stores/missionStore';
import { useWatchlistStore } from '../stores/watchlistStore';
import type { RiskLevel } from '@sentinel/shared/src/types';

const LEVEL_ORDER: Record<RiskLevel, number> = {
    LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3,
};

export function useWatchlistAlerts(): void {
    const watchedIds = useWatchlistStore((s) => s.watchedIds);
    const satellites = useMissionStore((s) => s.satellites);
    const prevLevels = useRef<Map<number, RiskLevel>>(new Map());

    useEffect(() => {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const idSet = new Set(watchedIds);

        for (const sat of satellites) {
            if (!idSet.has(sat.id)) continue;

            const prev = prevLevels.current.get(sat.id);
            const curr = sat.riskLevel;

            if (
                prev &&
                curr &&
                LEVEL_ORDER[curr] > LEVEL_ORDER[prev] &&
                LEVEL_ORDER[curr] >= 2
            ) {
                if (Notification.permission === 'granted') {
                    new Notification(`${sat.name} — ${curr}`, {
                        body: `Risk escalated from ${prev} to ${curr}. Score: ${sat.riskScore}/100.\n${(sat.threats ?? []).join(', ')}`,
                        tag: `sat-${sat.id}-${curr}`,
                    });
                }
            }

            if (curr) prevLevels.current.set(sat.id, curr);
        }
    }, [satellites, watchedIds]);
}
