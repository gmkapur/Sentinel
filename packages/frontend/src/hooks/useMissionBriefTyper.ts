import { useEffect, useRef } from 'react';
import { useMissionStore } from '../stores/missionStore';

const MS_PER_CHAR = 30;

export function useMissionBriefTyper(): void {
    const missionBrief = useMissionStore((s) => s.missionBrief);
    const setMissionBriefTyping = useMissionStore((s) => s.setMissionBriefTyping);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const targetRef = useRef('');

    useEffect(() => {
        targetRef.current = missionBrief;
        setMissionBriefTyping('');
        let i = 0;
        if (timerRef.current) clearInterval(timerRef.current);
        if (!missionBrief) {
            return;
        }
        timerRef.current = setInterval(() => {
            i += 1;
            const next = targetRef.current.slice(0, i);
            setMissionBriefTyping(next);
            if (i >= targetRef.current.length && timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        }, MS_PER_CHAR);
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [missionBrief, setMissionBriefTyping]);
}
