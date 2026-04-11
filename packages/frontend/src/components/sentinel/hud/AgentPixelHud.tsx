import { useEffect, useRef, useState } from 'react';
import { useMissionStore } from '../../../stores/missionStore';
import { formatOrbitSuggestionCardText } from '../../../utils/formatOrbitSuggestionCard';
import AgentRing from './AgentRing';

const TEAL = '#14B8A6';
const LABEL = '#6d7f7c';

/**
 * Left HUD: one fixed column under the ring — speech, situation, orbit suggestion.
 * Layout: `.sentinel-left-agent-column` in app.css (stacks, scrolls, avoids overlap).
 */
export function AgentPixelHud() {
    const outputScrollRef = useRef<HTMLDivElement>(null);
    const prevSpeakingRef = useRef(false);

    const agentStatus = useMissionStore((s) => s.agentStatus);
    const agentSpeaking = useMissionStore((s) => s.agentSpeaking);
    const agentSpeechTarget = useMissionStore((s) => s.agentSpeechTarget);
    const agentSpeechRevealEnd = useMissionStore((s) => s.agentSpeechRevealEnd);
    const agentOutputGhost = useMissionStore((s) => s.agentOutputGhost);
    const zoomState = useMissionStore((s) => s.zoomState);
    const assetSituationSummary = useMissionStore((s) => s.assetSituationSummary);
    const orbitSuggestionLoading = useMissionStore((s) => s.orbitSuggestionLoading);
    const orbitSuggestionResult = useMissionStore((s) => s.orbitSuggestionResult);

    const [speakHudPulse, setSpeakHudPulse] = useState(false);

    const alertMode = agentStatus === 'ALERT';

    useEffect(() => {
        const was = prevSpeakingRef.current;
        prevSpeakingRef.current = agentSpeaking;
        if (agentSpeaking && !was) {
            setSpeakHudPulse(true);
            const t = window.setTimeout(() => setSpeakHudPulse(false), 720);
            return () => window.clearTimeout(t);
        }
    }, [agentSpeaking]);

    const liveText =
        agentSpeechTarget.length > 0
            ? agentSpeechTarget.slice(0, Math.min(agentSpeechRevealEnd, agentSpeechTarget.length))
            : '';

    useEffect(() => {
        const el = outputScrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
    }, [
        liveText,
        agentOutputGhost,
        assetSituationSummary,
        orbitSuggestionLoading,
        orbitSuggestionResult,
    ]);

    const pulseClass = speakHudPulse ? 'agent-bracket-speak-pulse' : '';

    return (
        <div className="sentinel-left-agent-column">
            <div className="agent-container sentinel-left-agent-ring shrink-0">
                <div className={ `relative p-2 ${pulseClass}` }>
                    <div className={ `agent-ring-shell ${alertMode ? 'agent-ring-shell--alert' : ''}` }>
                        <AgentRing status={ agentStatus } />
                    </div>
                </div>
            </div>
            <div className={ `agent-label sentinel-left-agent-label shrink-0 px-2 py-1 ${pulseClass}` }>
                <div
                    className="space-y-0.5 text-[8px] font-medium uppercase leading-tight tracking-wide"
                    style={ { color: TEAL } }
                >
                    <div>SENTINEL-1</div>
                    <div className="opacity-90">ORBITAL INTELLIGENCE AGENT</div>
                    <div style={ { color: LABEL } }>STATUS: ACTIVE</div>
                </div>
            </div>
            <div
                ref={ outputScrollRef }
                className="sentinel-left-agent-output agent-hud-suggestions-scroll agent-output-scroll px-2 pb-2 pt-1"
            >
                <div className={ `rounded-sm border border-[#14B8A6]/15 bg-[rgba(3,5,10,0.82)] p-2 ${pulseClass}` }>
                    <div
                        className="text-[8px] font-medium uppercase tracking-wide"
                        style={ { color: LABEL } }
                    >
                        Agent output
                    </div>
                    <div
                        className="mt-1 overflow-x-hidden pr-0.5 text-[9px] font-normal leading-snug"
                        style={ {
                            color: TEAL,
                            wordBreak: 'break-word',
                            whiteSpace: 'pre-wrap',
                        } }
                    >
                        { agentOutputGhost ? (
                            <div className="mb-1 opacity-30">{ agentOutputGhost }</div>
                        ) : null }
                        { liveText ? <div>{ liveText }</div> : null }
                        { !liveText && !agentOutputGhost ? (
                            <div className="opacity-25">—</div>
                        ) : null }
                    </div>
                </div>

                { zoomState === 'ASSET_LOCK' && assetSituationSummary ? (
                    <div
                        className="mt-2 rounded-sm border border-[#14B8A6]/20 bg-[rgba(3,5,10,0.88)] p-2"
                    >
                        <div
                            className="text-[8px] font-medium uppercase tracking-wide"
                            style={ { color: LABEL } }
                        >
                            Situation assessment
                        </div>
                        <p
                            className="mt-1 text-[9px] font-normal leading-snug"
                            style={ { color: TEAL } }
                        >
                            { assetSituationSummary }
                        </p>
                    </div>
                ) : null }

                { zoomState === 'ASSET_LOCK'
                    && (orbitSuggestionLoading || orbitSuggestionResult) ? (
                    <div className="mt-2 rounded-sm border border-[#14B8A6]/25 bg-[rgba(3,5,10,0.9)] p-2">
                        <div
                            className="text-[8px] font-medium uppercase tracking-wide"
                            style={ { color: LABEL } }
                        >
                            Orbit suggestion
                        </div>
                        { orbitSuggestionLoading ? (
                            <div className="mt-1.5 text-[9px]" style={ { color: TEAL } }>
                                Computing maneuver…
                            </div>
                        ) : null }
                        { orbitSuggestionResult ? (
                            <pre
                                className="mt-1.5 overflow-x-hidden whitespace-pre-wrap font-mono text-[8px] leading-relaxed"
                                style={ { color: TEAL } }
                            >
                                { formatOrbitSuggestionCardText(orbitSuggestionResult) }
                            </pre>
                        ) : null }
                    </div>
                ) : null }
            </div>
        </div>
    );
}
