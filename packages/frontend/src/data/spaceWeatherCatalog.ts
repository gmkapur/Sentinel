export type SpaceWeatherCatalogEntry = {
    id: string;
    name: string;
    category: string;
    severity: string;
    dotCount: number;
};

export const SPACE_WEATHER_CATALOG: SpaceWeatherCatalogEntry[] = [
    { id: 'SOLAR_FLARE_X', name: 'SOLAR FLARE  X-CLASS', category: 'SOLAR', severity: 'EXTREME', dotCount: 4 },
    { id: 'SOLAR_FLARE_M', name: 'SOLAR FLARE  M-CLASS', category: 'SOLAR', severity: 'HIGH', dotCount: 6 },
    { id: 'CME_HALO', name: 'HALO CME', category: 'SOLAR', severity: 'EXTREME', dotCount: 3 },
    { id: 'CME_STANDARD', name: 'CORONAL MASS EJECTION', category: 'SOLAR', severity: 'HIGH', dotCount: 8 },
    { id: 'SEP', name: 'SOLAR ENERGETIC PARTICLE', category: 'SOLAR', severity: 'HIGH', dotCount: 12 },
    { id: 'SOLAR_RADIO', name: 'SOLAR RADIO BURST', category: 'SOLAR', severity: 'MODERATE', dotCount: 5 },
    { id: 'SOLAR_WIND', name: 'SOLAR WIND PRESSURE SURGE', category: 'SOLAR', severity: 'MODERATE', dotCount: 7 },
    { id: 'PROTON_EVENT', name: 'SOLAR PROTON EVENT', category: 'SOLAR', severity: 'HIGH', dotCount: 9 },
    { id: 'EUV_BURST', name: 'EXTREME UV BURST', category: 'SOLAR', severity: 'HIGH', dotCount: 6 },
    { id: 'GEO_G5', name: 'GEOMAGNETIC STORM  G5', category: 'GEOMAGNETIC', severity: 'EXTREME', dotCount: 3 },
    { id: 'GEO_G4', name: 'GEOMAGNETIC STORM  G4', category: 'GEOMAGNETIC', severity: 'SEVERE', dotCount: 5 },
    { id: 'GEO_G3', name: 'GEOMAGNETIC STORM  G3', category: 'GEOMAGNETIC', severity: 'STRONG', dotCount: 8 },
    { id: 'GEO_G2', name: 'GEOMAGNETIC STORM  G2', category: 'GEOMAGNETIC', severity: 'MODERATE', dotCount: 12 },
    { id: 'SUBSTORM', name: 'MAGNETOSPHERIC SUBSTORM', category: 'GEOMAGNETIC', severity: 'MODERATE', dotCount: 10 },
    { id: 'MAGNETOCOMP', name: 'MAGNETOSPHERE COMPRESSION', category: 'GEOMAGNETIC', severity: 'HIGH', dotCount: 4 },
    { id: 'VAN_ALLEN', name: 'VAN ALLEN BELT EXPANSION', category: 'RADIATION', severity: 'HIGH', dotCount: 6 },
    { id: 'REL_ELECTRON', name: 'RELATIVISTIC ELECTRON EVENT', category: 'RADIATION', severity: 'HIGH', dotCount: 8 },
    { id: 'COSMIC_RAY', name: 'COSMIC RAY EVENT', category: 'RADIATION', severity: 'MODERATE', dotCount: 15 },
    { id: 'SAA', name: 'SOUTH ATLANTIC ANOMALY', category: 'RADIATION', severity: 'MODERATE', dotCount: 1 },
    { id: 'SEU', name: 'SINGLE EVENT UPSET', category: 'RADIATION', severity: 'LOW', dotCount: 20 },
    { id: 'TOTAL_DOSE', name: 'TOTAL IONIZING DOSE', category: 'RADIATION', severity: 'LOW', dotCount: 18 },
    { id: 'CONJUNCTION', name: 'CONJUNCTION WARNING', category: 'DEBRIS', severity: 'CRITICAL', dotCount: 5 },
    { id: 'DEBRIS_CLOUD', name: 'DEBRIS CLOUD PASSAGE', category: 'DEBRIS', severity: 'HIGH', dotCount: 8 },
    { id: 'FRAGMENTATION', name: 'FRAGMENTATION EVENT', category: 'DEBRIS', severity: 'EXTREME', dotCount: 3 },
    { id: 'ASAT_DEBRIS', name: 'ASAT TEST DEBRIS FIELD', category: 'DEBRIS', severity: 'EXTREME', dotCount: 2 },
    { id: 'HYPERVELOCITY', name: 'HYPERVELOCITY IMPACT', category: 'DEBRIS', severity: 'CRITICAL', dotCount: 4 },
    { id: 'KESSLER', name: 'KESSLER CASCADE RISK', category: 'DEBRIS', severity: 'EXTREME', dotCount: 2 },
    { id: 'ATMO_DRAG', name: 'ATMOSPHERIC DRAG SURGE', category: 'ATMOSPHERIC', severity: 'HIGH', dotCount: 10 },
    { id: 'ORBITAL_DECAY', name: 'ORBITAL DECAY ALERT', category: 'ATMOSPHERIC', severity: 'HIGH', dotCount: 7 },
    { id: 'THERMO_SPIKE', name: 'THERMOSPHERE DENSITY SPIKE', category: 'ATMOSPHERIC', severity: 'MODERATE', dotCount: 9 },
    { id: 'REENTRY_RISK', name: 'REENTRY PREDICTION FAILURE', category: 'ATMOSPHERIC', severity: 'HIGH', dotCount: 4 },
    { id: 'SAT_CHARGING', name: 'SPACECRAFT CHARGING EVENT', category: 'ENVIRONMENT', severity: 'HIGH', dotCount: 11 },
    { id: 'DEEP_DIELEC', name: 'DEEP DIELECTRIC CHARGING', category: 'ENVIRONMENT', severity: 'HIGH', dotCount: 8 },
    { id: 'ELECTROSTATIC', name: 'ELECTROSTATIC DISCHARGE', category: 'ENVIRONMENT', severity: 'HIGH', dotCount: 9 },
    { id: 'METEOR_LEONID', name: 'LEONID METEOR STORM', category: 'ENVIRONMENT', severity: 'MODERATE', dotCount: 14 },
    { id: 'METEOR_PERSEID', name: 'PERSEID METEOR STREAM', category: 'ENVIRONMENT', severity: 'LOW', dotCount: 18 },
    { id: 'METEOR_GEMINID', name: 'GEMINID METEOR STREAM', category: 'ENVIRONMENT', severity: 'LOW', dotCount: 16 },
    { id: 'MICROMETEOROID', name: 'MICROMETEOROID STREAM', category: 'ENVIRONMENT', severity: 'MODERATE', dotCount: 20 },
];

export const WEATHER_CATEGORY_PILLS = [
    'ALL',
    'SOLAR',
    'GEOMAGNETIC',
    'RADIATION',
    'DEBRIS',
    'ATMOSPHERIC',
    'ENVIRONMENT',
] as const;

export type WeatherCategoryPill = (typeof WEATHER_CATEGORY_PILLS)[number];

/** Representative altitude (km); caller may jitter per dot. */
export function baseAltitudeKmForWeatherCategory(category: string): number {
    switch (category) {
        case 'SOLAR':
            return 35786;
        case 'GEOMAGNETIC':
            return 20000;
        case 'RADIATION':
            return 15000;
        case 'DEBRIS':
            return 800;
        case 'ATMOSPHERIC':
            return 320;
        case 'ENVIRONMENT':
            return 600;
        default:
            return 550;
    }
}
