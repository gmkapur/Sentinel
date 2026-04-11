import type {
    SatPosition,
    SpaceWeatherState,
    NEOObject,
    RiskLevel,
    OrbitRegime,
    SatRiskBreakdown,
    SatRiskSummary,
} from '@sentinel/shared';

// ---------------------------------------------------------------------------
// Subsolar point — determines which hemisphere faces the sun
// ---------------------------------------------------------------------------

function getDayOfYear(date: Date): number {
    const start = new Date(date.getUTCFullYear(), 0, 0);
    const diff = date.getTime() - start.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export function getSubsolarPoint(date: Date): { lat: number; lng: number } {
    const dayOfYear = getDayOfYear(date);
    const hours =
        date.getUTCHours() +
        date.getUTCMinutes() / 60 +
        date.getUTCSeconds() / 3600;

    // Solar declination (approximate, ±0.5° accuracy)
    const declination =
        -23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));

    // At 0:00 UTC the sun is at ~180°E, moving 15°/hr westward
    let lng = 180 - hours * 15;
    if (lng < -180) lng += 360;
    if (lng > 180) lng -= 360;

    return { lat: declination, lng };
}

// ---------------------------------------------------------------------------
// Solar zenith angle — angular distance between satellite and subsolar point
// ---------------------------------------------------------------------------

export function getSolarZenithAngle(
    satLat: number,
    satLng: number,
    subsolar: { lat: number; lng: number },
): number {
    const toRad = Math.PI / 180;
    const lat1 = satLat * toRad;
    const lat2 = subsolar.lat * toRad;
    const dLng = (satLng - subsolar.lng) * toRad;

    const cosAngle =
        Math.sin(lat1) * Math.sin(lat2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);

    return Math.acos(Math.max(-1, Math.min(1, cosAngle))) / toRad;
}

// ---------------------------------------------------------------------------
// Orbit classification
// ---------------------------------------------------------------------------

export function classifyOrbit(altKm: number): OrbitRegime {
    if (altKm < 2000) return 'LEO';
    if (altKm < 35286) return 'MEO';
    if (altKm <= 36286) return 'GEO';
    return 'HEO';
}

// ---------------------------------------------------------------------------
// South Atlantic Anomaly detection
// ---------------------------------------------------------------------------

export function isInSAA(lat: number, lng: number): boolean {
    return lat >= -50 && lat <= -10 && lng >= -90 && lng <= 40;
}

// ---------------------------------------------------------------------------
// Individual signal scorers
// ---------------------------------------------------------------------------

interface ScoreResult {
    score: number;
    threat: string | null;
}

export function scoreFlareExposure(
    xrayClass: string | null,
    zenithAngle: number,
): ScoreResult {
    if (!xrayClass) return { score: 0, threat: null };

    let baseScore = 0;
    let label = '';
    const cls = xrayClass.toUpperCase();

    if (cls.startsWith('X')) {
        baseScore = 40;
        label = 'X-class flare';
    } else if (cls.startsWith('M')) {
        const num = parseFloat(cls.slice(1)) || 1;
        if (num >= 5) {
            baseScore = 25;
            label = 'M5+ flare';
        } else {
            baseScore = 15;
            label = `${cls} flare`;
        }
    } else if (cls.startsWith('C')) {
        baseScore = 5;
        label = 'C-class flare';
    }

    if (baseScore === 0) return { score: 0, threat: null };

    let exposure: number;
    let exposureLabel: string;
    if (zenithAngle < 90) {
        exposure = 1.0;
        exposureLabel = 'sunlit';
    } else if (zenithAngle <= 100) {
        exposure = 0.5;
        exposureLabel = 'terminator';
    } else {
        return { score: 0, threat: null };
    }

    const score = Math.round(baseScore * exposure);
    return { score, threat: `${label} (${exposureLabel})` };
}

export function scoreGeomagnetic(
    kp: number | null,
    regime: OrbitRegime,
    altKm: number,
): ScoreResult {
    if (kp === null || regime !== 'LEO') return { score: 0, threat: null };

    let base = 0;
    if (kp >= 7) base = 30;
    else if (kp >= 5) base = 15;
    else if (kp >= 4) base = 5;
    else return { score: 0, threat: null };

    const multiplier = altKm < 500 ? 1.5 : 1.0;
    const score = Math.min(Math.round(base * multiplier), 45);

    const lowLeo = altKm < 500 ? ', low-LEO drag amplified' : '';
    return { score, threat: `Kp ${kp} geomagnetic storm${lowLeo}` };
}

export function scoreRadiation(
    protonFlux: number | null,
    regime: OrbitRegime,
    lat: number,
    lng: number,
): ScoreResult {
    if (protonFlux === null) return { score: 0, threat: null };

    let base = 0;
    if (protonFlux >= 100) base = 25;
    else if (protonFlux >= 10) base = 15;
    else if (protonFlux >= 1) base = 5;
    else return { score: 0, threat: null };

    let score = 0;
    let threat = '';

    switch (regime) {
    case 'LEO': {
        score = base;
        const inSaa = isInSAA(lat, lng);
        if (inSaa) {
            score += 10;
            threat = `Proton flux ${protonFlux} pfu + SAA passage`;
        } else {
            threat = `Proton flux ${protonFlux} pfu`;
        }
        break;
    }
    case 'MEO':
        score = base + 5;
        threat = `Proton flux ${protonFlux} pfu (radiation belt)`;
        break;
    case 'GEO':
        score = Math.round(base * 0.5);
        threat = `Proton flux ${protonFlux} pfu (partial shielding)`;
        break;
    default:
        score = base;
        threat = `Proton flux ${protonFlux} pfu`;
    }

    return { score, threat };
}

export function scoreSolarWind(
    windSpeed: number | null,
    regime: OrbitRegime,
): ScoreResult {
    if (windSpeed === null || regime !== 'GEO')
        return { score: 0, threat: null };

    if (windSpeed > 700)
        return {
            score: 15,
            threat: `Solar wind ${windSpeed} km/s (GEO surface charging risk)`,
        };
    if (windSpeed > 500)
        return {
            score: 5,
            threat: `Solar wind ${windSpeed} km/s (elevated)`,
        };
    return { score: 0, threat: null };
}

export function scoreNeo(hasPHA: boolean): ScoreResult {
    return hasPHA
        ? { score: 5, threat: 'PHA within 7-day window' }
        : { score: 0, threat: null };
}

// ---------------------------------------------------------------------------
// Compound synergy
// ---------------------------------------------------------------------------

export function computeCompoundBonus(
    xrayClass: string | null,
    kp: number | null,
    protonFlux: number | null,
    regime: OrbitRegime,
    sunlit: boolean,
): ScoreResult {
    const threats: string[] = [];
    let bonus = 0;

    const isM5Plus =
        xrayClass !== null &&
        (xrayClass.toUpperCase().startsWith('X') ||
            (xrayClass.toUpperCase().startsWith('M') &&
                (parseFloat(xrayClass.slice(1)) || 0) >= 5));
    const kpHigh = (kp ?? 0) >= 5;
    const kpSevere = (kp ?? 0) >= 7;
    const protonHigh = (protonFlux ?? 0) >= 100;

    if (isM5Plus && kpHigh && regime === 'LEO' && sunlit) {
        bonus += 15;
        threats.push('CME-driven storm + flare exposure (LEO sunlit)');
    }

    if (kpSevere && protonHigh && regime === 'LEO') {
        bonus += 20;
        threats.push('Severe radiation + atmospheric drag (LEO)');
    }

    if (isM5Plus && sunlit) {
        bonus += 10;
        threats.push('Direct radiation exposure window (sunlit)');
    }

    return {
        score: bonus,
        threat: threats.length > 0 ? threats.join('; ') : null,
    };
}

// ---------------------------------------------------------------------------
// Bz multiplier
// ---------------------------------------------------------------------------

export function getBzMultiplier(bz: number | null): number {
    if (bz === null) return 1.0;
    if (bz < -10) return 1.2;
    if (bz < -5) return 1.1;
    return 1.0;
}

// ---------------------------------------------------------------------------
// Single-satellite scorer (orchestrator)
// ---------------------------------------------------------------------------

function scoreToLevel(score: number): RiskLevel {
    if (score >= 70) return 'CRITICAL';
    if (score >= 40) return 'HIGH';
    if (score >= 20) return 'MODERATE';
    return 'LOW';
}

export function computeSingleSatelliteRisk(
    sat: SatPosition,
    weather: SpaceWeatherState,
    subsolar: { lat: number; lng: number },
    hasPHA: boolean,
): SatPosition {
    const regime = classifyOrbit(sat.alt);
    const zenith = getSolarZenithAngle(sat.lat, sat.lng, subsolar);
    const sunlit = zenith < 100;
    const inSaa = regime === 'LEO' && isInSAA(sat.lat, sat.lng);

    const flare = scoreFlareExposure(weather.xrayClass, zenith);
    const geo = scoreGeomagnetic(weather.kpIndex, regime, sat.alt);
    const rad = scoreRadiation(weather.protonFlux, regime, sat.lat, sat.lng);
    const wind = scoreSolarWind(weather.solarWindSpeed, regime);
    const neo = scoreNeo(hasPHA);
    const compound = computeCompoundBonus(
        weather.xrayClass,
        weather.kpIndex,
        weather.protonFlux,
        regime,
        sunlit,
    );

    const rawScore =
        flare.score +
        geo.score +
        rad.score +
        wind.score +
        neo.score +
        compound.score;
    const bzMult = getBzMultiplier(weather.bz);
    const adjusted = Math.round(rawScore * bzMult);
    const finalScore = Math.min(adjusted, 100);

    const threats = [flare, geo, rad, wind, neo, compound]
        .map((r) => r.threat)
        .filter((t): t is string => t !== null);

    return {
        ...sat,
        orbitRegime: regime,
        riskScore: finalScore,
        riskLevel: scoreToLevel(finalScore),
        isSunlit: zenith < 90,
        isInSAA: inSaa,
        threats,
    };
}

// ---------------------------------------------------------------------------
// Batch scorer — main entry point called from the broadcast loop
// ---------------------------------------------------------------------------

export function computePerSatelliteRisk(
    positions: SatPosition[],
    weather: SpaceWeatherState | null,
    neos: NEOObject[],
): SatPosition[] {
    if (!weather) {
        return positions.map((sat) => ({
            ...sat,
            orbitRegime: classifyOrbit(sat.alt),
            riskScore: 0,
            riskLevel: 'LOW' as RiskLevel,
            isSunlit: false,
            isInSAA: false,
            threats: [],
        }));
    }

    const now = new Date();
    const subsolar = getSubsolarPoint(now);
    const hasPHA = neos.some((neo) => neo.isPotentiallyHazardous);

    return positions.map((sat) =>
        computeSingleSatelliteRisk(sat, weather, subsolar, hasPHA),
    );
}

// ---------------------------------------------------------------------------
// Top risk satellites — for LLM briefs and REST endpoint
// ---------------------------------------------------------------------------

export function getTopRiskSatellites(
    enriched: SatPosition[],
    count: number = 10,
): SatRiskSummary[] {
    return enriched
        .filter((s) => (s.riskScore ?? 0) > 0)
        .sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
        .slice(0, count)
        .map((s) => ({
            noradId: s.id,
            name: s.name,
            orbitRegime: s.orbitRegime!,
            riskScore: s.riskScore!,
            riskLevel: s.riskLevel!,
            threats: s.threats ?? [],
        }));
}

// ---------------------------------------------------------------------------
// Detailed breakdown — for per-satellite REST endpoint
// ---------------------------------------------------------------------------

export function computeDetailedBreakdown(
    sat: SatPosition,
    weather: SpaceWeatherState | null,
    neos: NEOObject[],
): SatRiskBreakdown {
    const regime = classifyOrbit(sat.alt);
    const now = new Date();
    const subsolar = getSubsolarPoint(now);
    const zenith = getSolarZenithAngle(sat.lat, sat.lng, subsolar);
    const sunlit = zenith < 100;
    const inSaa = regime === 'LEO' && isInSAA(sat.lat, sat.lng);
    const hasPHA = neos.some((neo) => neo.isPotentiallyHazardous);

    const wx: SpaceWeatherState = weather ?? {
        xrayClass: null,
        kpIndex: null,
        protonFlux: null,
        solarWindSpeed: null,
        bz: null,
        timestamp: new Date().toISOString(),
    };

    const flare = scoreFlareExposure(wx.xrayClass, zenith);
    const geo = scoreGeomagnetic(wx.kpIndex, regime, sat.alt);
    const rad = scoreRadiation(wx.protonFlux, regime, sat.lat, sat.lng);
    const wind = scoreSolarWind(wx.solarWindSpeed, regime);
    const neo = scoreNeo(hasPHA);
    const compound = computeCompoundBonus(
        wx.xrayClass,
        wx.kpIndex,
        wx.protonFlux,
        regime,
        sunlit,
    );
    const bzMult = getBzMultiplier(wx.bz);

    const rawTotal =
        flare.score +
        geo.score +
        rad.score +
        wind.score +
        neo.score +
        compound.score;
    const finalScore = Math.min(Math.round(rawTotal * bzMult), 100);

    const threats = [flare, geo, rad, wind, neo, compound]
        .map((r) => r.threat)
        .filter((t): t is string => t !== null);

    return {
        satellite: {
            noradId: sat.id,
            name: sat.name,
            orbitRegime: regime,
            altitude: sat.alt,
            lat: sat.lat,
            lng: sat.lng,
            isSunlit: zenith < 90,
            isInSAA: inSaa,
            solarZenithAngle: Math.round(zenith * 100) / 100,
        },
        scoring: {
            flareExposure: flare.score,
            geomagnetic: geo.score,
            radiation: rad.score,
            solarWind: wind.score,
            neo: neo.score,
            compound: compound.score,
            bzMultiplier: bzMult,
            rawTotal,
            finalScore,
        },
        level: scoreToLevel(finalScore),
        threats,
        timestamp: new Date().toISOString(),
    };
}
