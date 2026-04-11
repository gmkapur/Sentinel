import { useState, useEffect } from 'react';
import { useEarthDirectedPredictions } from '../../stores/missionStore';
import type { FlarePathPrediction } from '@sentinel/shared/src/types';

function formatCountdown(ms: number): string {
    if (ms <= 0) return 'NOW';
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    if (hours > 0) return `${hours}h ${minutes}m`;
    const seconds = Math.floor((ms % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function getDirectednessLabel(d: string): string {
    switch (d) {
        case 'DIRECT_HIT':
            return 'DIRECT';
        case 'GLANCING':
            return 'GLANCING';
        default:
            return d;
    }
}

function getDirectednessColor(d: string): string {
    switch (d) {
        case 'DIRECT_HIT':
            return 'text-risk-critical';
        case 'GLANCING':
            return 'text-risk-high';
        default:
            return 'text-text-muted';
    }
}

export function CMECountdown() {
    const predictions = useEarthDirectedPredictions();
    const [, setTick] = useState(0);

    // Tick every second for countdown
    useEffect(() => {
        if (predictions.length === 0) return;
        const interval = setInterval(() => setTick((t) => t + 1), 1000);
        return () => clearInterval(interval);
    }, [predictions.length]);

    if (predictions.length === 0) return null;

    // Find most imminent prediction
    const sorted = [...predictions].sort(
        (a, b) =>
            new Date(a.estimatedArrivalTime).getTime() -
            new Date(b.estimatedArrivalTime).getTime(),
    );
    const imminent: FlarePathPrediction = sorted[0];
    const msUntil =
        new Date(imminent.estimatedArrivalTime).getTime() - Date.now();

    return (
        <div className="glass-panel px-3 py-2 flex items-center gap-2">
            <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-risk-critical animate-pulse" />
                <span className="font-mono text-xs font-bold text-risk-critical">
                    CME
                </span>
            </div>
            <div className="flex flex-col">
                <span className="font-mono text-sm font-bold text-text-primary tabular-nums">
                    {formatCountdown(msUntil)}
                </span>
                <span className="flex items-center gap-1">
                    <span
                        className={`font-mono text-[10px] font-semibold ${getDirectednessColor(imminent.earthDirectedness)}`}
                    >
                        {getDirectednessLabel(imminent.earthDirectedness)}
                    </span>
                    <span className="font-mono text-[10px] text-text-muted">
                        {Math.round(imminent.earthImpactProbability * 100)}%
                    </span>
                </span>
            </div>
            {sorted.length > 1 && (
                <span className="font-mono text-[10px] text-text-muted ml-1">
                    +{sorted.length - 1} more
                </span>
            )}
        </div>
    );
}
