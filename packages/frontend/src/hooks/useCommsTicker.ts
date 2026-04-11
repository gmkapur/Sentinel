import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useMissionStore } from '../stores/missionStore';

const DEMO_LINES: { event: string; status: string; severity: 'nominal' | 'warning' | 'critical' }[] = [
    { event: 'SENTINEL ACTIVE  ··  ALL SATELLITE ASSETS NOMINAL', status: 'NOMINAL', severity: 'nominal' },
    { event: 'DONKI FEED INGESTED  ··  0 SOLAR EVENTS', status: 'NOMINAL', severity: 'nominal' },
    { event: 'TLE UPDATE  ··  31,976 ORBITAL OBJECTS TRACKED', status: 'NOMINAL', severity: 'nominal' },
    { event: 'CME DETECTED  ··  LEO CORRIDOR INTERCEPT CONFIRMED', status: 'ALERT', severity: 'critical' },
    { event: 'AGENT REASONING  ··  CROSS-REFERENCING SATELLITE REGISTRY', status: 'RUN', severity: 'warning' },
    { event: 'RISK ASSESSMENT  ··  38 ASSETS IN THREAT CORRIDOR', status: 'ALERT', severity: 'critical' },
    { event: 'MISSION BRIEF GENERATED  ··  SATELLITE OPERATOR ACTION REQUIRED', status: 'BRIEF', severity: 'warning' },
    { event: 'OUTBOUND ALERT  ··  OPERATOR PHONE CALL INITIATED', status: 'CALL', severity: 'warning' },
];

export function useCommsTicker(enabled: boolean): void {
    const prependComms = useMissionStore((s) => s.prependComms);
    const setLiveStats = useMissionStore((s) => s.setLiveStats);
    const idxRef = useRef(0);

    useEffect(() => {
        if (!enabled) return;
        const tick = () => {
            const row = DEMO_LINES[idxRef.current % DEMO_LINES.length];
            idxRef.current += 1;
            prependComms({
                time: format(new Date(), 'HH:mm:ss'),
                event: row.event,
                status: row.status,
                severity: row.severity,
            });
            const atRisk =
                row.event.includes('38 ASSETS IN THREAT')
                || row.event.includes('SATELLITE OPERATOR ACTION REQUIRED')
                    ? 38
                    : 0;
            const nextWin =
                row.event.includes('CME DETECTED')
                || row.event.includes('38 ASSETS IN THREAT')
                || row.event.includes('SATELLITE OPERATOR ACTION REQUIRED')
                    ? 'T-68H'
                    : 'T-0H';
            const conf =
                row.event.includes('SATELLITE OPERATOR ACTION REQUIRED')
                || row.event.includes('OPERATOR PHONE CALL INITIATED')
                    ? 94
                    : 90;
            setLiveStats({
                atRiskAssets: atRisk,
                nextEventWindow: nextWin,
                agentConfidencePct: conf,
            });
        };
        const id = window.setInterval(tick, 4200);
        tick();
        return () => window.clearInterval(id);
    }, [enabled, prependComms, setLiveStats]);
}
