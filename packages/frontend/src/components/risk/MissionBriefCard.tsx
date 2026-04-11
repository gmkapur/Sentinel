import { useState } from 'react';
import { Shield, AlertTriangle, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { GlassPanel } from '../shared/GlassPanel';
import { Spinner } from '../shared/Spinner';
import { useMissionStore } from '../../stores/missionStore';
import { api } from '../../services/api';

const REC_STYLES = {
    GO: 'bg-risk-low/20 text-risk-low border-risk-low/30',
    CAUTION: 'bg-risk-moderate/20 text-risk-moderate border-risk-moderate/30',
    'NO-GO': 'bg-risk-critical/20 text-risk-critical border-risk-critical/30',
};

function getConfidenceColor(c: number): string {
    if (c >= 0.8) return 'bg-risk-low';
    if (c >= 0.5) return 'bg-risk-moderate';
    return 'bg-risk-critical';
}

export function MissionBriefCard() {
    const brief = useMissionStore((s) => s.brief);
    const setBrief = useMissionStore((s) => s.setBrief);
    const [regenerating, setRegenerating] = useState(false);

    async function handleRegenerate() {
        setRegenerating(true);
        try {
            const newBrief = await api.regenerateBrief();
            setBrief(newBrief);
        }
        catch (err) {
            console.error('Failed to regenerate brief:', err);
        }
        finally {
            setRegenerating(false);
        }
    }

    return (
        <GlassPanel title="MISSION BRIEF" icon={ <Shield size={ 14 } /> }>
            { !brief ? (
                <div className="py-4">
                    <div className="space-y-2">
                        <div className="h-3 bg-border-subtle/50 rounded animate-pulse w-3/4" />
                        <div className="h-3 bg-border-subtle/50 rounded animate-pulse w-full" />
                        <div className="h-3 bg-border-subtle/50 rounded animate-pulse w-1/2" />
                    </div>
                    <p className="text-text-muted text-xs italic mt-3">
                        Awaiting mission brief...
                    </p>
                </div>
            ) : (
                <div>
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={ brief.recommendation }
                            initial={ { scale: 0.9, opacity: 0 } }
                            animate={ { scale: 1, opacity: 1 } }
                            exit={ { scale: 0.9, opacity: 0 } }
                            transition={ { duration: 0.2 } }
                            className="mb-2"
                        >
                            <span
                                className={ `inline-block font-mono font-bold text-xs px-2.5 py-1 rounded border ${REC_STYLES[brief.recommendation]} ${
                                    brief.recommendation === 'NO-GO' ? 'critical-pulse' : ''
                                }` }
                            >
                                { brief.recommendation }
                            </span>
                        </motion.div>
                    </AnimatePresence>

                    <p className="text-sm text-text-primary leading-relaxed mt-2">
                        { brief.summary }
                    </p>

                    { brief.threats.length > 0 && (
                        <ul className="mt-2 space-y-1">
                            { brief.threats.map((threat, i) => (
                                <li
                                    key={ i }
                                    className="flex items-start gap-1.5 text-xs text-text-secondary"
                                >
                                    <AlertTriangle
                                        size={ 12 }
                                        className="text-risk-high mt-0.5 shrink-0"
                                    />
                                    <span>{ threat }</span>
                                </li>
                            )) }
                        </ul>
                    ) }

                    { brief.maneuverWindows.length > 0 && (
                        <div className="mt-2">
                            <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium">
                                Maneuver Windows
                            </span>
                            { brief.maneuverWindows.map((window, i) => (
                                <p
                                    key={ i }
                                    className="text-xs text-text-muted font-mono mt-0.5"
                                >
                                    { window }
                                </p>
                            )) }
                        </div>
                    ) }

                    <div className="mt-3">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-text-muted uppercase tracking-wider">
                                Confidence
                            </span>
                            <span className="text-[10px] text-text-muted font-mono">
                                { Math.round(brief.confidence * 100) }%
                            </span>
                        </div>
                        <div className="h-1 bg-border-subtle/30 rounded-full overflow-hidden">
                            <motion.div
                                className={ `h-full rounded-full ${getConfidenceColor(brief.confidence)}` }
                                initial={ { width: 0 } }
                                animate={ { width: `${brief.confidence * 100}%` } }
                                transition={ { type: 'spring', stiffness: 200, damping: 25 } }
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border-subtle">
                        <span className="text-[10px] text-text-muted">
                            { brief.isLlm ? 'AI Generated' : 'Deterministic' }
                        </span>
                        <button
                            onClick={ handleRegenerate }
                            disabled={ regenerating }
                            className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 disabled:opacity-50 transition-colors"
                        >
                            { regenerating ? (
                                <Spinner size={ 12 } />
                            ) : (
                                <RefreshCw size={ 12 } />
                            ) }
                            <span>Regenerate</span>
                        </button>
                    </div>
                </div>
            ) }
        </GlassPanel>
    );
}
