import { format } from 'date-fns';

export type SimEventType =
    | 'SOLAR_STORM'
    | 'CONJUNCTION'
    | 'RADIATION_BELT'
    | 'ATMOSPHERIC_DRAG'
    | 'EXTREME_CME';

export interface SimCinematicEvent {
    id: string;
    type: SimEventType;
    name: string;
    severity: 'HIGH' | 'CRITICAL';
    lat: number;
    lng: number;
    orbitAltitudeKm: number;
    assetsAtRisk: number;
    assetsAffected: string[];
    impactHours: number;
    collisionProbability: number | null;
    radiationLevel?: string;
    debrisObjects?: number;
    closestApproachKm?: number;
    protonFlux?: string;
    altitudeDecayKmPerDay?: number;
    description: string;
    recommendation: string;
    actionWindow: string;
    costOfInaction: string;
}

export const SIM_CINEMATIC_EVENTS: SimCinematicEvent[] = [
    {
        id: 'EVT-2024-MAY',
        type: 'SOLAR_STORM',
        name: 'CME ALPHA-7',
        severity: 'HIGH',
        lat: 0,
        lng: 45,
        orbitAltitudeKm: 550,
        assetsAtRisk: 38,
        assetsAffected: ['STARLINK-4800', 'STARLINK-4801', 'STARLINK-4802', 'STARLINK-4803'],
        impactHours: 68,
        collisionProbability: null,
        radiationLevel: 'X8.2',
        description:
            'X8.2 class CME on intercept with LEO orbital plane at 550km altitude. Proton flux will exceed satellite electronics shielding threshold. Onboard computer resets and solar panel degradation expected across 38 assets.',
        recommendation: 'SUSPEND NON-ESSENTIAL PAYLOAD OPS',
        actionWindow: '+18 HOURS',
        costOfInaction: '$240M ESTIMATED ASSET EXPOSURE',
    },
    {
        id: 'EVT-CONJ-IRD',
        type: 'CONJUNCTION',
        name: 'DEBRIS FIELD KILO-19',
        severity: 'CRITICAL',
        lat: 52.1,
        lng: -148.3,
        orbitAltitudeKm: 789,
        assetsAtRisk: 3,
        assetsAffected: ['STARLINK-4810', 'STARLINK-4811', 'STARLINK-4812'],
        impactHours: 4,
        collisionProbability: 34,
        debrisObjects: 847,
        closestApproachKm: 0.3,
        description:
            'Debris cluster on crossing trajectory through active LEO corridor. Three commercial satellites in primary risk zone. Closest approach 0.3km. Collision would generate secondary debris field affecting 200 additional assets.',
        recommendation: 'EXECUTE AVOIDANCE MANEUVER',
        actionWindow: '+90 MINUTES',
        costOfInaction: '$180M PER ASSET LOST',
    },
    {
        id: 'EVT-2003-OCT',
        type: 'RADIATION_BELT',
        name: 'PROTON EVENT DELTA-3',
        severity: 'CRITICAL',
        lat: 0,
        lng: 0,
        orbitAltitudeKm: 20_200,
        assetsAtRisk: 47,
        assetsAffected: ['GPS-BIIR-1', 'GPS-BIIR-2', 'GALILEO-FOC-1', 'GALILEO-FOC-2'],
        impactHours: 12,
        collisionProbability: null,
        protonFlux: 'S4',
        description:
            'S4 proton event expanding Van Allen belt into MEO corridor at 20,200km. GPS and navigation constellation entering primary exposure window. Satellite memory upsets and attitude control errors expected across 47 assets.',
        recommendation: 'SAFE MODE GPS CONSTELLATION',
        actionWindow: '+6 HOURS',
        costOfInaction:
            'DEGRADED GPS SATELLITE SIGNAL OUTPUT  ··  CONSTELLATION-WIDE SERVICE LOSS',
    },
    {
        id: 'EVT-2022-FEB',
        type: 'ATMOSPHERIC_DRAG',
        name: 'DRAG EVENT FOXTROT-2',
        severity: 'HIGH',
        lat: -12.4,
        lng: 22.6,
        orbitAltitudeKm: 210,
        assetsAtRisk: 40,
        assetsAffected: ['SENTINEL-LEO-001 through 040'],
        impactHours: 24,
        collisionProbability: null,
        altitudeDecayKmPerDay: 8.4,
        description:
            'Geomagnetic storm expanding upper atmosphere into LEO corridor at 210km. Drag forces on newly deployed assets are 50 times nominal. Satellites will lose altitude faster than propulsion can compensate and will reenter before reaching operational orbit.',
        recommendation: 'ABORT DEPLOYMENT  ··  DELAY REENTRY',
        actionWindow: '+6 HOURS',
        costOfInaction: '$80M  ··  40 ASSETS LOST TO REENTRY',
    },
    {
        id: 'EVT-2012-JUL',
        type: 'EXTREME_CME',
        name: 'CME OMEGA CLASS',
        severity: 'CRITICAL',
        lat: 0,
        lng: 90,
        orbitAltitudeKm: 400,
        assetsAtRisk: 6241,
        assetsAffected: ['FULL ORBITAL CATALOG'],
        impactHours: 216,
        collisionProbability: null,
        description:
            'Omega class CME on direct intercept with full orbital catalog. Estimated particle flux exceeds all recorded events. Satellite solar panels, onboard computers, and attitude control systems across all orbital shells at risk of permanent damage.',
        recommendation: 'EMERGENCY PROTOCOLS  ··  ALL OPERATORS NOTIFY',
        actionWindow: '+72 HOURS',
        costOfInaction: '$2 TRILLION ESTIMATED  ··  FULL CATALOG SATELLITE LOSS EVENT',
    },
];

export function simEventTypeLabel(ev: SimCinematicEvent): string {
    switch (ev.type) {
        case 'SOLAR_STORM':
            return 'Solar storm';
        case 'CONJUNCTION':
            return 'Debris conjunction';
        case 'RADIATION_BELT':
            return 'Radiation belt surge';
        case 'ATMOSPHERIC_DRAG':
            return 'Atmospheric drag';
        case 'EXTREME_CME':
            return 'Extreme CME';
        default:
            return ev.name;
    }
}

function formatCorridorCrossingTMinus(impactHours: number): string {
    const h = Math.max(1, Math.round(impactHours));
    if (h >= 48 && h % 24 === 0) {
        return `CORRIDOR CROSSING T-MINUS ${h / 24} DAYS`;
    }
    if (h >= 48) {
        const d = Math.floor(h / 24);
        const rem = h % 24;
        return `CORRIDOR CROSSING T-MINUS ${d}D ${rem}H`;
    }
    return `CORRIDOR CROSSING T-MINUS ${h} HOURS`;
}

function orbitalShellAndAltitude(ev: SimCinematicEvent): {
    shell: string;
    altLo: number;
    altHi: number;
} {
    switch (ev.type) {
        case 'RADIATION_BELT':
            return { shell: 'MEO', altLo: 19_500, altHi: 21_200 };
        case 'EXTREME_CME':
            return { shell: 'LEO / MEO / GEO', altLo: 200, altHi: 35_786 };
        case 'CONJUNCTION':
            return { shell: 'LEO', altLo: 720, altHi: 860 };
        case 'ATMOSPHERIC_DRAG':
            return { shell: 'LEO', altLo: 195, altHi: 230 };
        case 'SOLAR_STORM':
        default:
            return { shell: 'LEO', altLo: 480, altHi: 620 };
    }
}

/** Agent line at intercept lock — satellite-operator framing only. */
export function buildAgentInterceptLine(ev: SimCinematicEvent): string {
    switch (ev.type) {
        case 'SOLAR_STORM':
            return 'Incoming. Coronal mass ejection on intercept with LEO orbital plane. 38 satellite assets in the high risk corridor. Shielding threshold will be exceeded in 68 hours. Initiating risk assessment.';
        case 'CONJUNCTION':
            return 'Conjunction warning. Debris field Kilo-19 on crossing trajectory. Three active satellites in primary risk zone. Closest approach 0.3 kilometers in 4 hours. Maneuver window opens in 90 minutes.';
        case 'RADIATION_BELT':
            return 'Radiation belt expanding. 47 GPS and navigation satellites entering elevated proton flux zone. Satellite electronics degradation likely. Recommend safe mode for affected payloads.';
        case 'ATMOSPHERIC_DRAG':
            return `Drag event detected. Upper atmosphere expanding into low orbit corridor. ${ev.assetsAtRisk} satellites losing altitude at ${ev.altitudeDecayKmPerDay ?? 8.4} kilometers per day. Assets will not reach operational orbit without immediate action.`;
        case 'EXTREME_CME': {
            const d = Math.max(1, Math.round(ev.impactHours / 24));
            return `Incoming. Omega class coronal mass ejection on intercept with full orbital catalog. Satellite assets across all shells face elevated flux. Corridor crossing in ${d} days. Initiating risk assessment.`;
        }
        default:
            return `Threat locked. ${simEventTypeLabel(ev)} on intercept with orbital plane. ${ev.assetsAtRisk} satellite assets in the corridor. Corridor crossing in ${Math.round(ev.impactHours)} hours. Mission brief generating.`;
    }
}

export function buildMissionBriefFromSimEvent(ev: SimCinematicEvent): string {
    const stamp = `${format(new Date(), 'HH:mm')} UTC`;
    const { shell, altLo, altHi } = orbitalShellAndAltitude(ev);
    const body =
        ev.description.length > 220
            ? `${ev.description.slice(0, 217)}…`
            : ev.description;

    return `MISSION BRIEF  ··  ${stamp}

THREAT TYPE:           ${ev.name}
ASSETS IN CORRIDOR:    ${ev.assetsAtRisk}
ORBITAL SHELL:         ${shell}
ALTITUDE RANGE:        ${altLo}KM TO ${altHi}KM
CORRIDOR CROSSING:     ${formatCorridorCrossingTMinus(ev.impactHours)}

${body}

RECOMMENDED ACTION:    ${ev.recommendation}
ACTION WINDOW:         ${ev.actionWindow}
COST OF INACTION:      ${ev.costOfInaction}

SIGNED: ORBIT SENTINEL AGENT
THE WATCHGUARD FOR SPACE`;
}
