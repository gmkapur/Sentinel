import { useMemo } from 'react';
import { Star, Trash2, Eye } from 'lucide-react';
import { useMissionStore } from '../../stores/missionStore';
import { useWatchlistStore } from '../../stores/watchlistStore';
import { getRiskLevelColor } from '../../utils/colors';
import { LevelBadge } from '../shared/LevelBadge';
import { GlassPanel } from '../shared/GlassPanel';
import type { SatPosition } from '@sentinel/shared/src/types';

interface Props {
    onSelectSatellite: (sat: SatPosition) => void;
}

export function WatchlistPanel({ onSelectSatellite }: Props) {
    const watchedIds = useWatchlistStore((s) => s.watchedIds);
    const remove = useWatchlistStore((s) => s.remove);
    const clear = useWatchlistStore((s) => s.clear);
    const satellites = useMissionStore((s) => s.satellites);

    const watched = useMemo(() => {
        const idSet = new Set(watchedIds);
        return satellites
            .filter((s) => idSet.has(s.id))
            .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));
    }, [satellites, watchedIds]);

    if (watchedIds.length === 0) {
        return (
            <GlassPanel title="Watchlist" icon={<Star size={14} />}>
                <div className="text-center py-6">
                    <Eye
                        size={24}
                        className="mx-auto text-text-muted mb-2 opacity-40"
                    />
                    <p className="font-mono text-[11px] text-text-muted">
                        No satellites watched
                    </p>
                    <p className="font-mono text-[10px] text-text-muted mt-1">
                        Click a satellite on the globe or list,
                        <br />
                        then star it to add to your watchlist.
                    </p>
                </div>
            </GlassPanel>
        );
    }

    return (
        <GlassPanel title="Watchlist" icon={<Star size={14} />}>
            <div className="flex items-center justify-between mb-2">
                <span className="font-mono text-[10px] text-text-muted">
                    {watched.length} satellite{watched.length !== 1 ? 's' : ''}
                </span>
                <button
                    onClick={clear}
                    className="font-mono text-[10px] text-text-muted hover:text-risk-critical transition-colors"
                >
                    Clear all
                </button>
            </div>

            <div className="space-y-1">
                {watched.map((sat) => (
                    <div
                        key={sat.id}
                        className="flex items-center gap-2 p-1.5 rounded hover:bg-surface-raised/50 transition-colors cursor-pointer group"
                        onClick={() => onSelectSatellite(sat)}
                    >
                        <div
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                                backgroundColor: getRiskLevelColor(
                                    sat.riskLevel,
                                ),
                            }}
                        />
                        <div className="flex-1 min-w-0">
                            <div className="font-mono text-[11px] text-text-primary truncate">
                                {sat.name}
                            </div>
                            <div className="font-mono text-[9px] text-text-muted">
                                {sat.orbitRegime} &middot; {Math.round(sat.alt)}
                                km
                                {sat.isSunlit ? ' &middot; Sunlit' : ''}
                            </div>
                        </div>
                        <span
                            className="font-mono text-xs font-medium shrink-0"
                            style={{ color: getRiskLevelColor(sat.riskLevel) }}
                        >
                            {sat.riskScore ?? 0}
                        </span>
                        {sat.riskLevel && <LevelBadge level={sat.riskLevel} />}
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                remove(sat.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-risk-critical transition-all p-0.5"
                        >
                            <Trash2 size={10} />
                        </button>
                    </div>
                ))}
            </div>

            {/* Threats summary for watched satellites */}
            {watched.some((s) => (s.threats?.length ?? 0) > 0) && (
                <div className="mt-2 pt-2 border-t border-border-subtle">
                    <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1">
                        Active Threats
                    </div>
                    {watched
                        .filter((s) => (s.threats?.length ?? 0) > 0)
                        .slice(0, 5)
                        .map((sat) => (
                            <div key={sat.id} className="mb-1">
                                <span className="font-mono text-[10px] text-text-secondary">
                                    {sat.name}:
                                </span>
                                {sat.threats!.slice(0, 2).map((t, i) => (
                                    <div
                                        key={i}
                                        className="font-mono text-[10px] text-risk-high pl-2"
                                    >
                                        {t}
                                    </div>
                                ))}
                            </div>
                        ))}
                </div>
            )}
        </GlassPanel>
    );
}
