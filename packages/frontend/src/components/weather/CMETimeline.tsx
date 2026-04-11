import { useMemo } from 'react';
import { useEarthDirectedPredictions } from '../../stores/missionStore';
import type { CMEEarthDirectedness } from '@sentinel/shared/src/types';

interface TimelineItem {
    id: string;
    cmeId: string;
    speed: number;
    directedness: CMEEarthDirectedness;
    startPct: number;
    endPct: number;
    estPct: number;
    widthPct: number;
}

const TIMELINE_HOURS = 72;

export function CMETimeline() {
    const predictions = useEarthDirectedPredictions();

    const items = useMemo((): TimelineItem[] => {
        const now = Date.now();
        const end = now + TIMELINE_HOURS * 3_600_000;

        return predictions
            .map((pred) => {
                const arrivalStart = new Date(pred.arrivalWindowStart).getTime();
                const arrivalEnd = new Date(pred.arrivalWindowEnd).getTime();
                const estimated = new Date(pred.estimatedArrivalTime).getTime();

                // Clamp to timeline window
                const startPct = Math.max(0, ((arrivalStart - now) / (end - now)) * 100);
                const endPct = Math.min(100, ((arrivalEnd - now) / (end - now)) * 100);
                const estPct = Math.max(0, Math.min(100, ((estimated - now) / (end - now)) * 100));

                return {
                    id: pred.id,
                    cmeId: pred.associatedCMEID.slice(-8),
                    speed: pred.coneSpeedKmS,
                    directedness: pred.earthDirectedness,
                    startPct,
                    endPct,
                    estPct,
                    widthPct: Math.max(endPct - startPct, 1),
                };
            })
            .filter((item) => item.endPct > 0);
    }, [predictions]);

    if (items.length === 0) return null;

    return (
        <div className="glass-panel p-3">
            <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    CME Arrival Timeline (72h)
                </span>
                <span className="font-mono text-[10px] text-text-muted">
                    {items.length} active
                </span>
            </div>

            {/* Timeline axis */}
            <div className="relative">
                {/* Hour markers */}
                <div className="flex justify-between mb-1">
                    {[0, 12, 24, 36, 48, 60, 72].map((h) => (
                        <span
                            key={h}
                            className="font-mono text-[9px] text-text-muted"
                        >
                            {h}h
                        </span>
                    ))}
                </div>

                {/* Track */}
                <div className="relative h-2 bg-surface-dim rounded-full mb-1">
                    {/* "Now" marker */}
                    <div className="absolute left-0 top-0 w-0.5 h-full bg-accent z-10" />
                </div>

                {/* CME bars */}
                {items.map((item) => (
                    <div key={item.id} className="relative h-5 mb-1">
                        {/* Window bar */}
                        <div
                            className={`absolute top-0 h-full rounded-sm ${
                                item.directedness === 'DIRECT_HIT'
                                    ? 'bg-risk-critical/30'
                                    : 'bg-risk-high/25'
                            }`}
                            style={{
                                left: `${item.startPct}%`,
                                width: `${item.widthPct}%`,
                            }}
                        />
                        {/* Estimated arrival marker */}
                        <div
                            className={`absolute top-0 w-0.5 h-full ${
                                item.directedness === 'DIRECT_HIT'
                                    ? 'bg-risk-critical'
                                    : 'bg-risk-high'
                            }`}
                            style={{ left: `${item.estPct}%` }}
                        />
                        {/* Label */}
                        <span
                            className="absolute top-0.5 font-mono text-[9px] text-text-secondary whitespace-nowrap"
                            style={{
                                left: `${Math.min(item.startPct + 1, 85)}%`,
                            }}
                        >
                            {item.cmeId} {item.speed} km/s
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
