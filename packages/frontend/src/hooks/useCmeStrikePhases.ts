import { useEffect, useRef } from 'react';
import { useMissionStore } from '../stores/missionStore';

function clearTimers(timers: number[]) {
    timers.forEach((t) => window.clearTimeout(t));
}

/**
 * Drives CME strike store flags (white flash → red path) from flare/storm overlay timing.
 * No floating UI — zones are painted on the globe.
 */
export function useCmeStrikePhases(): void {
    const cinematicActive = useMissionStore((s) => s.cinematicActive);
    const flare = useMissionStore((s) => s.overlaySolarFlare);
    const storm = useMissionStore((s) => s.overlaySolarStorm);
    const setFlareOff = useMissionStore((s) => s.setOverlaySolarFlare);
    const setWhite = useMissionStore((s) => s.setCmeSatellitesWhiteFlash);
    const setRed = useMissionStore((s) => s.setCmeSatellitesRed);

    const prevStorm = useRef(false);

    useEffect(() => {
        if (cinematicActive || !flare) {
            return;
        }

        const timers: number[] = [];
        const hitDelay = 3380;
        timers.push(
            window.setTimeout(() => {
                setWhite(true);
            }, hitDelay)
        );
        timers.push(
            window.setTimeout(() => {
                setWhite(false);
                setRed(true);
            }, hitDelay + 160)
        );
        timers.push(
            window.setTimeout(() => {
                setFlareOff(false);
            }, hitDelay + 450)
        );

        return () => {
            clearTimers(timers);
        };
    }, [cinematicActive, flare, setFlareOff, setRed, setWhite]);

    useEffect(() => {
        if (!storm) {
            prevStorm.current = false;
            return;
        }
        if (cinematicActive) {
            return;
        }
        if (flare) {
            prevStorm.current = true;
            return;
        }

        const rising = !prevStorm.current;
        prevStorm.current = true;
        if (!rising) {
            return;
        }

        const timers: number[] = [];
        timers.push(
            window.setTimeout(() => {
                setWhite(true);
            }, 3000)
        );
        timers.push(
            window.setTimeout(() => {
                setWhite(false);
                setRed(true);
            }, 3160)
        );

        return () => {
            clearTimers(timers);
        };
    }, [cinematicActive, flare, storm, setRed, setWhite]);
}
