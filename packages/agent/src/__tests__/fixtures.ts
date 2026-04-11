import type {
    SpaceWeatherState,
    DONKIFlare,
    DONKICME,
    NEOObject,
} from '@sentinel/shared';

/**
 * Fixture data based on the May 10-12, 2024 G5 geomagnetic storm —
 * the strongest geomagnetic storm since 2003. Multiple X-class flares
 * from AR 3664, Kp reaching 9, proton flux exceeding 500 pfu.
 *
 * Used to validate that the risk engine produces CRITICAL (score 100)
 * for a known extreme event.
 */

export const g5StormWeather: SpaceWeatherState = {
    xrayClass: 'X5.8',
    kpIndex: 9,
    protonFlux: 500,
    solarWindSpeed: 900,
    bz: -25,
    timestamp: '2024-05-11T03:00:00Z',
};

export const g5StormFlares: DONKIFlare[] = [
    {
        flrID: 'FLR-2024-05-10T06:54:00-X5.8',
        classType: 'X5.8',
        beginTime: '2024-05-10T06:35:00Z',
        peakTime: '2024-05-10T06:54:00Z',
        endTime: '2024-05-10T07:16:00Z',
        sourceLocation: 'S17W44',
    },
    {
        flrID: 'FLR-2024-05-09T09:13:00-X2.2',
        classType: 'X2.2',
        beginTime: '2024-05-09T09:00:00Z',
        peakTime: '2024-05-09T09:13:00Z',
        endTime: '2024-05-09T09:30:00Z',
        sourceLocation: 'S17W34',
    },
    {
        flrID: 'FLR-2024-05-08T22:08:00-X1.0',
        classType: 'X1.0',
        beginTime: '2024-05-08T21:40:00Z',
        peakTime: '2024-05-08T22:08:00Z',
        endTime: '2024-05-08T22:30:00Z',
        sourceLocation: 'S17W25',
    },
];

export const g5StormCMEs: DONKICME[] = [
    {
        activityID: '2024-05-10T07:24:00-CME-001',
        startTime: '2024-05-10T07:24:00Z',
        speed: 1450,
        type: 'C',
    },
    {
        activityID: '2024-05-09T09:36:00-CME-001',
        startTime: '2024-05-09T09:36:00Z',
        speed: 1200,
        type: 'C',
    },
];

export const g5StormNeos: NEOObject[] = [];

/**
 * Quiet sun baseline — no significant activity.
 * Used to validate LOW risk score (0-15).
 */

export const quietSunWeather: SpaceWeatherState = {
    xrayClass: null,
    kpIndex: 1,
    protonFlux: 0.1,
    solarWindSpeed: 350,
    bz: 2,
    timestamp: '2024-01-15T12:00:00Z',
};

export const quietSunFlares: DONKIFlare[] = [];
export const quietSunCMEs: DONKICME[] = [];
export const quietSunNeos: NEOObject[] = [];

/**
 * Moderate M-class flare event with mild geomagnetic response.
 * Used to validate MODERATE risk score (20-39).
 */

export const moderateEventWeather: SpaceWeatherState = {
    xrayClass: 'M3.2',
    kpIndex: 4,
    protonFlux: 5,
    solarWindSpeed: 450,
    bz: -3,
    timestamp: '2024-03-20T15:00:00Z',
};

export const moderateEventFlares: DONKIFlare[] = [
    {
        flrID: 'FLR-2024-03-20T14:22:00-M3.2',
        classType: 'M3.2',
        beginTime: '2024-03-20T14:00:00Z',
        peakTime: '2024-03-20T14:22:00Z',
        endTime: '2024-03-20T14:45:00Z',
        sourceLocation: 'N15E30',
    },
];
