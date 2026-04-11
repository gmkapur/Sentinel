import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sun, Moon, AlertTriangle, Shield, Star, Volume2, VolumeX } from 'lucide-react';
import type { SatPosition, SatRiskBreakdown } from '@sentinel/shared/src/types';
import { getRiskLevelColor } from '../../utils/colors';
import { formatCoord, formatAlt } from '../../utils/formatters';
import { LevelBadge } from '../shared/LevelBadge';
import { useWatchlistStore } from '../../stores/watchlistStore';

interface Props {
    satellite: SatPosition;
    onClose: () => void;
    onNarrate?: (objectId: string, objectName: string) => void;
    isNarrating?: boolean;
}

// Uses relative URL — Vite proxy forwards /api to the gateway

const BREAKDOWN_LABELS: Record<string, string> = {
    flareExposure: 'Solar Flare',
    geomagnetic: 'Geomagnetic',
    radiation: 'Radiation',
    solarWind: 'Solar Wind',
    neo: 'NEO Proximity',
    conjunction: 'Conjunction',
    compound: 'Compound',
};

const BREAKDOWN_MAX: Record<string, number> = {
    flareExposure: 40,
    geomagnetic: 45,
    radiation: 35,
    solarWind: 15,
    neo: 30,
    conjunction: 30,
    compound: 45,
};

function BreakdownBar({
    label,
    value,
    max,
}: {
    label: string;
    value: number;
    max: number;
}) {
    const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] text-text-muted w-20 shrink-0 text-right">
                {label}
            </span>
            <div className="flex-1 h-1.5 bg-surface-raised rounded-full overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                        width: `${pct}%`,
                        backgroundColor: value > 0 ? '#f97316' : '#334155',
                    }}
                />
            </div>
            <span className="font-mono text-[10px] text-text-secondary w-6 text-right">
                {value}
            </span>
        </div>
    );
}

export function SatelliteDetailPanel({ satellite, onClose, onNarrate, isNarrating }: Props) {
    const [breakdown, setBreakdown] = useState<SatRiskBreakdown | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        setBreakdown(null);
        fetch(`/api/v1/satellites/${satellite.id}/risk`)
            .then((res) => {
                if (!res.ok) throw new Error('Not found');
                return res.json();
            })
            .then((data: SatRiskBreakdown) => {
                setBreakdown(data);
                setLoading(false);
            })
            .catch(() => setLoading(false));
    }, [satellite.id]);

    const riskColor = getRiskLevelColor(satellite.riskLevel);
    const isWatched = useWatchlistStore((s) =>
        s.watchedIds.includes(satellite.id),
    );
    const toggleWatch = useWatchlistStore((s) => s.toggle);

    return (
        <AnimatePresence>
            <motion.div
                className="absolute top-4 left-4 z-20 glass-panel p-4 w-[300px] max-h-[calc(100%-2rem)] overflow-y-auto"
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.2 }}
            >
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                    <div className="flex-1 min-w-0">
                        <h3 className="font-mono text-sm font-medium text-accent truncate">
                            {satellite.name}
                        </h3>
                        <span className="font-mono text-[10px] text-text-muted">
                            NORAD {satellite.id}
                        </span>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => toggleWatch(satellite.id)}
                            className={`transition-colors p-0.5 ${isWatched ? 'text-yellow-400' : 'text-text-muted hover:text-yellow-400'}`}
                            title={
                                isWatched
                                    ? 'Remove from watchlist'
                                    : 'Add to watchlist'
                            }
                        >
                            <Star
                                size={14}
                                fill={isWatched ? 'currentColor' : 'none'}
                            />
                        </button>
                        {onNarrate && (
                            <button
                                onClick={() =>
                                    isNarrating
                                        ? onNarrate('', '')
                                        : onNarrate(String(satellite.id), satellite.name)
                                }
                                className={`transition-colors p-0.5 ${isNarrating ? 'text-accent animate-pulse' : 'text-text-muted hover:text-accent'}`}
                                title={isNarrating ? 'Stop narration' : 'Narrate this satellite'}
                            >
                                {isNarrating ? <VolumeX size={14} /> : <Volume2 size={14} />}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="text-text-muted hover:text-text-primary transition-colors p-0.5"
                        >
                            <X size={14} />
                        </button>
                    </div>
                </div>

                {/* Risk score */}
                <div
                    className="flex items-center gap-3 mb-3 p-2 rounded-lg"
                    style={{ backgroundColor: `${riskColor}15` }}
                >
                    <div
                        className="font-mono text-2xl font-bold"
                        style={{ color: riskColor }}
                    >
                        {satellite.riskScore ?? 0}
                    </div>
                    <div>
                        {satellite.riskLevel && (
                            <LevelBadge level={satellite.riskLevel} size="md" />
                        )}
                        <div className="font-mono text-[10px] text-text-muted mt-0.5">
                            risk score
                        </div>
                    </div>
                </div>

                {/* Orbital info */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-3">
                    <div className="font-mono text-[10px] text-text-muted">
                        Regime
                    </div>
                    <div className="font-mono text-xs text-text-primary">
                        {satellite.orbitRegime ?? '—'}
                    </div>
                    <div className="font-mono text-[10px] text-text-muted">
                        Altitude
                    </div>
                    <div className="font-mono text-xs text-text-primary">
                        {formatAlt(satellite.alt)}
                    </div>
                    <div className="font-mono text-[10px] text-text-muted">
                        Position
                    </div>
                    <div className="font-mono text-xs text-text-primary">
                        {formatCoord(satellite.lat)}&deg;,{' '}
                        {formatCoord(satellite.lng)}&deg;
                    </div>
                    <div className="font-mono text-[10px] text-text-muted">
                        Sunlit
                    </div>
                    <div className="font-mono text-xs text-text-primary flex items-center gap-1">
                        {satellite.isSunlit ? (
                            <>
                                <Sun size={10} className="text-yellow-400" />{' '}
                                Yes
                            </>
                        ) : (
                            <>
                                <Moon size={10} className="text-blue-400" />{' '}
                                Shadow
                            </>
                        )}
                    </div>
                    <div className="font-mono text-[10px] text-text-muted">
                        SAA
                    </div>
                    <div className="font-mono text-xs text-text-primary flex items-center gap-1">
                        {satellite.isInSAA ? (
                            <>
                                <AlertTriangle
                                    size={10}
                                    className="text-risk-high"
                                />{' '}
                                Inside
                            </>
                        ) : (
                            <>
                                <Shield size={10} className="text-text-muted" />{' '}
                                Outside
                            </>
                        )}
                    </div>
                </div>

                {/* Breakdown bars */}
                {loading && !breakdown && (
                    <div className="font-mono text-[10px] text-text-muted text-center py-2">
                        Loading breakdown...
                    </div>
                )}

                {breakdown && (
                    <div className="mb-3">
                        <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1.5">
                            Score Breakdown
                        </div>
                        <div className="space-y-1">
                            {Object.entries(BREAKDOWN_LABELS).map(
                                ([key, label]) => (
                                    <BreakdownBar
                                        key={key}
                                        label={label}
                                        value={
                                            breakdown.scoring[
                                                key as keyof typeof breakdown.scoring
                                            ] as number
                                        }
                                        max={BREAKDOWN_MAX[key] ?? 40}
                                    />
                                ),
                            )}
                        </div>
                        {breakdown.scoring.bzMultiplier > 1 && (
                            <div className="font-mono text-[10px] text-text-muted mt-1 text-right">
                                Bz multiplier: &times;
                                {breakdown.scoring.bzMultiplier}
                            </div>
                        )}
                    </div>
                )}

                {/* Conjunctions */}
                {satellite.conjunctions && satellite.conjunctions.length > 0 && (
                    <div className="mb-3">
                        <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1">
                            Conjunctions
                        </div>
                        <ul className="space-y-1">
                            {satellite.conjunctions.map((c) => {
                                const otherName =
                                    c.sat1Id === satellite.id
                                        ? c.sat2Name
                                        : c.sat1Name;
                                const sevColor =
                                    c.severity === 'CRITICAL'
                                        ? 'text-risk-critical'
                                        : c.severity === 'WARNING'
                                          ? 'text-risk-high'
                                          : 'text-yellow-400';
                                return (
                                    <li
                                        key={c.id}
                                        className="font-mono text-[11px] flex items-start gap-1.5"
                                    >
                                        <span
                                            className={`mt-0.5 shrink-0 ${sevColor}`}
                                        >
                                            &bull;
                                        </span>
                                        <span className="text-text-secondary">
                                            {otherName}{' '}
                                            <span className={sevColor}>
                                                {c.distanceKm.toFixed(1)} km
                                            </span>
                                            {c.isIntraConstellation && (
                                                <span className="text-text-muted ml-1">
                                                    (same group)
                                                </span>
                                            )}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                )}

                {/* Threats */}
                {satellite.threats && satellite.threats.length > 0 && (
                    <div>
                        <div className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium mb-1">
                            Active Threats
                        </div>
                        <ul className="space-y-0.5">
                            {satellite.threats.map((t, i) => (
                                <li
                                    key={i}
                                    className="font-mono text-[11px] text-risk-high flex items-start gap-1.5"
                                >
                                    <span className="text-risk-high mt-0.5 shrink-0">
                                        &bull;
                                    </span>
                                    {t}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
