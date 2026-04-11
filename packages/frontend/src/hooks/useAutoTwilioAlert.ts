import { useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { useMissionStore } from '../stores/missionStore';
import { api } from '../services/api';

export function useAutoTwilioAlert(): void {
    const threatLevel = useMissionStore((s) => s.threatLevel);
    const simulateRunning = useMissionStore((s) => s.simulateRunning);
    const setCallStatus = useMissionStore((s) => s.setCallStatus);
    const appendPhoneLog = useMissionStore((s) => s.appendPhoneLog);
    const prevRef = useRef(useMissionStore.getState().threatLevel);
    const firedRef = useRef(false);

    useEffect(() => {
        if (simulateRunning) {
            prevRef.current = threatLevel;
            return;
        }

        const prev = prevRef.current;
        const crossedToHigh =
            threatLevel === 'HIGH' && prev !== 'HIGH' && prev !== 'CRITICAL';

        if (!simulateRunning && crossedToHigh && !firedRef.current) {
            firedRef.current = true;
            void (async () => {
                setCallStatus('CALLING');
                try {
                    const to = useMissionStore.getState().alertNumber || undefined;
                    await api.postCall({ test: false, to });
                    setCallStatus('CONNECTED');
                    appendPhoneLog(
                        `[${format(new Date(), 'HH:mm:ss')}]  ${to ?? 'REGISTERED'}  ··  CONNECTED`
                    );
                }
                catch (e) {
                    setCallStatus('ENDED');
                    appendPhoneLog(
                        `[${format(new Date(), 'HH:mm:ss')}]  AUTO ALERT FAILED  ··  ${e instanceof Error ? e.message : 'ERROR'}`
                    );
                }
            })();
        }

        if (threatLevel === 'NOMINAL' || threatLevel === 'WARNING') {
            firedRef.current = false;
        }

        prevRef.current = threatLevel;
    }, [appendPhoneLog, setCallStatus, simulateRunning, threatLevel]);
}
