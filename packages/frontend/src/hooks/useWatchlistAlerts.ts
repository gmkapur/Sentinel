import { useEffect, useRef } from 'react';
import { useMissionStore } from '../stores/missionStore';
import { useWatchlistStore } from '../stores/watchlistStore';
import type { RiskLevel } from '@sentinel/shared/src/types';

const LEVEL_ORDER: Record<RiskLevel, number> = {
    LOW: 0,
    MODERATE: 1,
    HIGH: 2,
    CRITICAL: 3,
};

export function useWatchlistAlerts(): void {
    const watchedIds = useWatchlistStore((s) => s.watchedIds);
    const satellites = useMissionStore((s) => s.satellites);
    const predictions = useMissionStore((s) => s.flarePathPredictions);
    const prevLevels = useRef<Map<number, RiskLevel>>(new Map());
    const notifiedCME = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            Notification.requestPermission();
        }

        const idSet = new Set(watchedIds);

        // Risk level escalation alerts
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

        // CME impact alerts for watchlisted satellites
        if (Notification.permission === 'granted') {
            for (const pred of predictions) {
                if (!pred.isEarthDirected) continue;
                for (const impact of pred.affectedSatellites ?? []) {
                    if (!idSet.has(impact.noradId)) continue;
                    if (impact.impactProbability < 0.5) continue;

                    const notifKey = `${pred.id}-${impact.noradId}`;
                    if (notifiedCME.current.has(notifKey)) continue;
                    notifiedCME.current.add(notifKey);

                    const hoursUntil =
                        (new Date(pred.estimatedArrivalTime).getTime() -
                            Date.now()) /
                        3_600_000;
                    const eta =
                        hoursUntil > 0
                            ? `ETA ${Math.round(hoursUntil)}h`
                            : 'arrival imminent';

                    new Notification(
                        `CME Impact: ${impact.name}`,
                        {
                            body: `${pred.earthDirectedness} CME (${eta}, ${Math.round(impact.impactProbability * 100)}% impact prob). ${impact.advisory}`,
                            tag: notifKey,
                        },
                    );
                }
            }
        }
    }, [satellites, watchedIds, predictions]);
}
