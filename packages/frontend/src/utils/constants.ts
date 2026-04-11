export const ALTITUDE_BANDS = {
    LEO: { max: 2000, label: 'LEO', color: '#22d3ee' },
    MEO: { max: 35786, label: 'MEO', color: '#eab308' },
    GEO: { max: 36786, label: 'GEO', color: '#f97316' },
    HEO: { max: Infinity, label: 'HEO', color: '#a855f7' },
} as const;

export const RISK_THRESHOLDS = {
    LOW: { min: 0, max: 19 },
    MODERATE: { min: 20, max: 39 },
    HIGH: { min: 40, max: 69 },
    CRITICAL: { min: 70, max: 100 },
} as const;

export const EARTH_RADIUS_KM = 6371;

export const BREAKDOWN_LABELS: Record<string, { label: string; icon: string }> = {
    flare: { label: 'Solar Flare', icon: 'Zap' },
    geomagnetic: { label: 'Geomagnetic', icon: 'Activity' },
    radiation: { label: 'Radiation', icon: 'Radiation' },
    solarWind: { label: 'Solar Wind', icon: 'Wind' },
    imfBz: { label: 'IMF Bz', icon: 'Magnet' },
    neo: { label: 'NEO', icon: 'Orbit' },
    compound: { label: 'Compound', icon: 'AlertTriangle' },
};
