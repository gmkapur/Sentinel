export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';
export type OrbitRegime = 'LEO' | 'MEO' | 'GEO' | 'HEO';
export type OrbitalRegistryClass = 'LEO' | 'MEO' | 'GEO' | 'STATION' | 'DEBRIS' | 'DEEPSPACE';

export interface RiskBreakdown {
    flare: number;
    geomagnetic: number;
    radiation: number;
    solarWind: number;
    imfBz: number;
    neo: number;
    cmePath: number;
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

    // Frontend catalog classification (demo/display only)
    registryClass?: OrbitalRegistryClass;

    // CME impact data (populated by flare path prediction pipeline)
    cmeImpactProbability?: number;

    // Proximity data (populated by gateway conjunction + NEO proximity modules)
    conjunctions?: ConjunctionEvent[];
    conjunctionCount?: number;
    nearestNeo?: { name: string; shellDeltaKm: number; missDistanceKm: number };
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

// ---------------------------------------------------------------------------
// CME Analysis (from DONKI /CMEAnalysis endpoint)
// ---------------------------------------------------------------------------

export interface CMEAnalysis {
    time21_5: string;           // Time at 21.5 solar radii (ISO datetime)
    latitude: number;           // HEEQ latitude (degrees)
    longitude: number;          // HEEQ longitude (degrees)
    halfAngle: number;          // Half-angle width of the CME cone (degrees)
    speed: number;              // CME speed (km/s)
    type: string;               // CME SCORE Scale type (S, C, O, R, ER)
    isMostAccurate: boolean;    // Best measurement flag
    associatedCMEID: string;    // Links to parent CME activityID
    note: string;               // Analyst notes
    catalog: string;            // M2M_CATALOG, SWPC_ANNEX_CME_CATALOG, etc.
}

// ---------------------------------------------------------------------------
// Flare Path Prediction
// ---------------------------------------------------------------------------

export type CMEEarthDirectedness = 'DIRECT_HIT' | 'GLANCING' | 'MISS';

export interface FlarePathPrediction {
    id: string;                          // Unique prediction ID (e.g., "FPP-{associatedCMEID}")
    associatedCMEID: string;             // Links to CMEAnalysis.associatedCMEID
    analysis: CMEAnalysis;               // The underlying CME analysis data

    // Cone geometry
    coneLatitude: number;                // Heliocentric lat (degrees)
    coneLongitude: number;               // Heliocentric lon (degrees)
    coneHalfAngle: number;               // Angular radius of cone (degrees)
    coneSpeedKmS: number;                // Propagation speed (km/s)

    // Arrival prediction
    estimatedArrivalTime: string;        // ISO datetime of predicted Earth arrival
    estimatedTransitHours: number;       // Transit time from Sun to Earth
    arrivalWindowStart: string;          // Earliest possible arrival (ISO)
    arrivalWindowEnd: string;            // Latest possible arrival (ISO)

    // Earth impact assessment
    earthDirectedness: CMEEarthDirectedness;
    earthImpactProbability: number;      // 0.0 to 1.0
    isEarthDirected: boolean;            // convenience: earthImpactProbability > 0.3

    // Affected satellites
    affectedSatellites: FlarePathImpact[];

    // Metadata
    generatedAt: string;                 // ISO timestamp of when prediction was computed
    confidence: number;                  // 0.0 to 1.0 overall prediction confidence
}

export interface FlarePathImpact {
    noradId: number;
    name: string;
    orbitRegime: OrbitRegime;
    impactProbability: number;           // 0.0 to 1.0
    predictedPosition: {                 // Position at estimated arrival time
        lat: number;
        lng: number;
        alt: number;
    };
    isSunlit: boolean;                   // At predicted arrival time
    isInSAA: boolean;                    // At predicted arrival time
    riskContribution: number;            // Additional risk points from this CME
    advisory: string;                    // Short recommendation (e.g., "Enter safe mode")
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

export interface EonetEvent {
    eventId: string;
    title: string;
    category: string;
    source: string;
    link: string | null;
    date: string;
    coordinates: {
        type: string;           // "Point" or "Polygon"
        coordinates: number[];  // [lng, lat] for Point
    } | null;
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
    eonetEvents: EonetEvent[];
    flarePathPredictions: FlarePathPrediction[];
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
        conjunction: number;
        cmeImpact: number;
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
    altitude: number;
    lat: number;
    lng: number;
    isSunlit: boolean;
    isInSAA: boolean;
    cmeImpactProbability?: number;
}

// ---------------------------------------------------------------------------
// Proximity types
// ---------------------------------------------------------------------------

export type ConjunctionSeverity = 'CLOSE_APPROACH' | 'WARNING' | 'CRITICAL';

export interface ConjunctionEvent {
    id: string;
    sat1Id: number;
    sat1Name: string;
    sat2Id: number;
    sat2Name: string;
    distanceKm: number;
    severity: ConjunctionSeverity;
    isIntraConstellation: boolean;
    sat1Regime: OrbitRegime;
    sat2Regime: OrbitRegime;
    sat1Position: { lat: number; lng: number; alt: number };
    sat2Position: { lat: number; lng: number; alt: number };
    timestamp: string;
}

export interface NeoProximityDetail {
    neoId: string;
    neoName: string;
    missDistanceKm: number;
    shellDeltaKm: number;
    score: number;
    isPotentiallyHazardous: boolean;
}
