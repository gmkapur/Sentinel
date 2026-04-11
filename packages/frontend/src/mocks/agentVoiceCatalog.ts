/**
 * Supplemental agent lines — satellite operators and orbital assets only.
 */
export const AGENT_VOICE_ON_BRIEF_READY =
    'Mission brief ready. Recommended action has been generated for all affected satellite operators. Check your dashboard now.';

export const AGENT_VOICE_ON_CALL_SENT =
    'Outbound alert initiated. Satellite operators have been notified by phone.';

export const AGENT_VOICE_ON_ALL_CLEAR =
    'Threat resolved. Orbital environment stable across all shells. All satellite assets nominal. Go for operations.';

export const AGENT_VOICE_EXTRA_LINES = [
    'Conjunction warning. Debris object 19742 on intercept with Starlink-4821. Closest approach 0.3 kilometers in 4 hours. Recommend maneuver window in 90 minutes.',
    'GPS constellation advisory. Solar radio burst degrading GPS satellite signal output. 24 MEO assets affected. Navigation payload accuracy reduced.',
    'Orbital decay alert. Starlink-2891 losing altitude at elevated rate. Current altitude 312 kilometers. Corridor crossing for reentry in 14 days. Recommend reboost authorization.',
    'Satellite charging event detected. 12 geostationary assets showing electrostatic buildup. Recommend payload safe mode for affected operators.',
    'Crewed station conjunction advisory. Debris field crossing station orbital corridor in 6 hours. Recommend station maneuver coordination with satellite operators.',
] as const;
