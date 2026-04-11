import type { RiskState, RiskLevel, RiskBreakdown } from '@sentinel/shared';

import {
    buildSpaceWeatherState,
    getRecentFlares,
    getUpcomingNeos,
    saveRiskAssessment,
} from './dataCache';

// ---------------------------------------------------------------------------
// Score → Level mapping
// ---------------------------------------------------------------------------

export function scoreToLevel(score: number): RiskLevel {
    if (score >= 70) return 'CRITICAL';
    if (score >= 40) return 'HIGH';
    if (score >= 20) return 'MODERATE';
    return 'LOW';
}

// ---------------------------------------------------------------------------
// Flare classification helpers
// ---------------------------------------------------------------------------

export function getFlareClass(
    classType: string | null,
): { letter: string; number: number } | null {
    if (!classType) return null;
    const match = classType.match(/^([ABCMX])(\d+\.?\d*)/i);
    if (!match) return null;
    return { letter: match[1].toUpperCase(), number: parseFloat(match[2]) };
}

export function scoreFlare(xrayClass: string | null): number {
    const parsed = getFlareClass(xrayClass);
    if (!parsed) return 0;

    switch (parsed.letter) {
        case 'X':
            return 40;
        case 'M':
            return parsed.number >= 5 ? 25 : 15;
        case 'C':
            return 5;
        default:
            return 0;
    }
}

export function isM5Plus(xrayClass: string | null): boolean {
    const parsed = getFlareClass(xrayClass);
    if (!parsed) return false;
    return (
        parsed.letter === 'X' || (parsed.letter === 'M' && parsed.number >= 5)
    );
}

// ---------------------------------------------------------------------------
// Individual signal scorers
// ---------------------------------------------------------------------------

export function scoreGeomagnetic(kp: number | null): number {
    if (kp === null) return 0;
    if (kp >= 7) return 30;
    if (kp >= 5) return 15;
    if (kp >= 4) return 5;
    return 0;
}

export function scoreRadiation(protonFlux: number | null): number {
    if (protonFlux === null) return 0;
    if (protonFlux >= 100) return 25;
    if (protonFlux >= 10) return 15;
    if (protonFlux >= 1) return 5;
    return 0;
}

export function scoreSolarWind(speed: number | null): number {
    if (speed === null) return 0;
    if (speed > 700) return 10;
    if (speed > 500) return 5;
    return 0;
}

export function scoreImfBz(bz: number | null): number {
    if (bz === null) return 0;
    if (bz < -10) return 10;
    if (bz < -5) return 5;
    return 0;
}

export function scoreNeo(hasPHA: boolean): number {
    return hasPHA ? 5 : 0;
}

// ---------------------------------------------------------------------------
// Compound synergy bonuses
// ---------------------------------------------------------------------------

export function computeCompoundBonus(
    xrayClass: string | null,
    kp: number | null,
    protonFlux: number | null,
): number {
    let bonus = 0;

    const m5Plus = isM5Plus(xrayClass);

    // M5+ flare AND Kp ≥ 5 — CME-driven storm confirmation
    if (m5Plus && kp !== null && kp >= 5) {
        bonus += 15;
    }

    // Kp ≥ 7 AND proton flux ≥ 100 — severe radiation + atmospheric drag
    if (kp !== null && kp >= 7 && protonFlux !== null && protonFlux >= 100) {
        bonus += 20;
    }

    // M5+ flare active — LEO sunlit radiation exposure window
    if (m5Plus) {
        bonus += 10;
    }

    return bonus;
}

// ---------------------------------------------------------------------------
// Main evaluation
// ---------------------------------------------------------------------------

export async function evaluate(): Promise<RiskState> {
    const weather = await buildSpaceWeatherState();

    // Check for PHAs in the next 7 days
    const neos = await getUpcomingNeos(7);
    const hasPHA = neos.some((n) => n.isPotentiallyHazardous);

    // Also check recent DONKI flares for active X-ray class (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentFlares = await getRecentFlares(oneDayAgo);
    const activeFlareClass =
        recentFlares.length > 0 ? recentFlares[0].classType : weather.xrayClass;

    // Compute base scores
    const flare = scoreFlare(activeFlareClass);
    const geomagnetic = scoreGeomagnetic(weather.kpIndex);
    const radiation = scoreRadiation(weather.protonFlux);
    const solarWind = scoreSolarWind(weather.solarWindSpeed);
    const imfBz = scoreImfBz(weather.bz);
    const neo = scoreNeo(hasPHA);

    // Compound synergy
    const compound = computeCompoundBonus(
        activeFlareClass,
        weather.kpIndex,
        weather.protonFlux,
    );

    // Total (capped at 100)
    const rawScore =
        flare + geomagnetic + radiation + solarWind + imfBz + neo + compound;
    const score = Math.min(rawScore, 100);
    const level = scoreToLevel(score);

    const breakdown: RiskBreakdown = {
        flare,
        geomagnetic,
        radiation,
        solarWind,
        imfBz,
        neo,
        compound,
    };

    const riskState: RiskState = {
        score,
        level,
        breakdown,
        timestamp: new Date().toISOString(),
    };

    // Persist to database
    await saveRiskAssessment(riskState);

    console.log(
        `[RiskEngine] Score: ${score} (${level}) | Breakdown: F=${flare} G=${geomagnetic} R=${radiation} W=${solarWind} Bz=${imfBz} N=${neo} C=${compound}`,
    );

    return riskState;
}
