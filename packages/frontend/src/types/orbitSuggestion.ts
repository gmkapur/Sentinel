export type OrbitSuggestionPayload = {
    recommendation: string;
    maneuver: {
        type: string;
        deltaAltitudeKm: number;
        deltaInclination: number;
        burnDurationSeconds: number;
        thrustDirection: string;
        urgencyHours: number;
    };
    newOrbit: {
        altitudeKm: number;
        inclination: number;
        safetyMarginKm: number;
    };
    costOfManeuver: string;
    riskIfIgnored: string;
};

export type OrbitSuggestionApiResponse = {
    suggestion: OrbitSuggestionPayload;
    newOrbit: OrbitSuggestionPayload['newOrbit'];
};
