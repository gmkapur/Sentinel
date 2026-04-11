import { format } from 'date-fns';

/** Demo mission brief — satellite assets only (no ground-impact framing). */
export function buildMissionBriefDemoText(): string {
    const stamp = `${format(new Date(), 'HH:mm')} UTC`;
    return `MISSION BRIEF  ··  ${stamp}

THREAT TYPE:           CORONAL MASS EJECTION
ASSETS IN CORRIDOR:    38
ORBITAL SHELL:         LEO
ALTITUDE RANGE:        480KM TO 620KM
CORRIDOR CROSSING:     CORRIDOR CROSSING T-MINUS 68 HOURS

M-class CME on intercept through the radiation corridor.
Satellite upset risk across LEO and MEO; payloads should expect sustained particle flux within the corridor crossing window.

RECOMMENDED ACTION:    DELAY LAUNCH / HOLD DISCRETIONARY MANEUVERS
ACTION WINDOW:         +18 HOURS
COST OF INACTION:      WIDESPREAD SATELLITE SERVICE DEGRADATION ACROSS AFFECTED CONSTELLATIONS

SIGNED: ORBIT SENTINEL AGENT
THE WATCHGUARD FOR SPACE`;
}
