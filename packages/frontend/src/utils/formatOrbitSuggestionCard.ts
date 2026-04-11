import type { OrbitSuggestionPayload } from '../types/orbitSuggestion';

function up(s: string): string {
    return s.toUpperCase().replace(/_/g, ' ');
}

export function formatOrbitSuggestionCardText(s: OrbitSuggestionPayload): string {
    const m = s.maneuver;
    const n = s.newOrbit;
    return [
        'ORBIT SUGGESTION  ··  GENERATED',
        '',
        `MANEUVER TYPE:    ${up(m.type)}`,
        `THRUST:           ${up(m.thrustDirection)}`,
        `BURN DURATION:    ${Math.round(m.burnDurationSeconds)} SECONDS`,
        `DELTA ALTITUDE:   ${m.deltaAltitudeKm >= 0 ? '+' : ''}${Math.round(m.deltaAltitudeKm)}KM`,
        `NEW ALTITUDE:     ${Math.round(n.altitudeKm)}KM`,
        `SAFETY MARGIN:    ${Math.round(n.safetyMarginKm)}KM FROM CORRIDOR`,
        `URGENCY:          BEGIN IN ${Math.max(1, Math.round(m.urgencyHours))} HOURS`,
        '',
        'RECOMMENDATION:',
        s.recommendation.trim(),
        '',
        `FUEL COST:        ${s.costOfManeuver.toUpperCase()}`,
        `RISK IF IGNORED:  ${s.riskIfIgnored.toUpperCase()}`,
    ].join('\n');
}
