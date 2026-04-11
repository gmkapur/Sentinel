export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';

export interface RiskBreakdown {
    flare: number;
    geomagnetic: number;
    radiation: number;
    solarWind: number;
    imfBz: number;
    neo: number;
    compound: number;
}

export interface RiskState {
    score: number;
    level: RiskLevel;
    breakdown: RiskBreakdown;
    timestamp: string;
}

export interface SpaceWeatherState {
    xrayClass: string | null;
    kpIndex: number | null;
    protonFlux: number | null;
    solarWindSpeed: number | null;
    bz: number | null;
    timestamp: string;
}

export interface MissionBrief {
    recommendation: 'GO' | 'CAUTION' | 'NO-GO';
    summary: string;
    threats: string[];
    maneuverWindows: string[];
    confidence: number;
    generatedAt: string;
    isLlm: boolean;
}

export interface SatPosition {
    id: number;
    name: string;
    lat: number;
    lng: number;
    alt: number;

    // Per-satellite risk (populated by gateway satRisk module)
    orbitRegime?: OrbitRegime;
    riskScore?: number;
    riskLevel?: RiskLevel;
    isSunlit?: boolean;
    isInSAA?: boolean;
    threats?: string[];
}

export interface DONKIFlare {
    flrID: string;
    classType: string;
    beginTime: string;
    peakTime: string;
    endTime: string | null;
    sourceLocation: string;
}

export interface DONKICME {
    activityID: string;
    startTime: string;
    speed: number | null;
    type: string;
}

export interface NEOObject {
    id: string;
    name: string;
    estimatedDiameter: number;
    isPotentiallyHazardous: boolean;
    closeApproachDate: string;
    missDistanceKm: number;
    relativeVelocityKmS: number;
}

export interface AlertRecord {
    id: string;
    level: RiskLevel;
    score: number;
    brief: string;
    timestamp: string;
}

export interface AgentPushPayload {
    risk: RiskState;
    brief: MissionBrief | null;
    spaceWeather: SpaceWeatherState;
    flares: DONKIFlare[];
    cmes: DONKICME[];
    neos: NEOObject[];
    timestamp: string;
}

export interface SatRiskBreakdown {
    satellite: {
        noradId: number;
        name: string;
        orbitRegime: OrbitRegime;
        altitude: number;
        lat: number;
        lng: number;
        isSunlit: boolean;
        isInSAA: boolean;
        solarZenithAngle: number;
    };
    scoring: {
        flareExposure: number;
        geomagnetic: number;
        radiation: number;
        solarWind: number;
        neo: number;
        compound: number;
        bzMultiplier: number;
        rawTotal: number;
        finalScore: number;
    };
    level: RiskLevel;
    threats: string[];
    timestamp: string;
}

export interface SatRiskSummary {
    noradId: number;
    name: string;
    orbitRegime: OrbitRegime;
    riskScore: number;
    riskLevel: RiskLevel;
    threats: string[];
}
