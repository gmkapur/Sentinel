/**
 * Demo Mode -- Injects fake high-risk space weather data into the agent cache
 * to simulate a severe compound threat scenario for demonstration purposes.
 *
 * Scenario: X5.3 solar flare + Kp 8 geomagnetic storm + high proton flux
 * + fast solar wind + strongly southward Bz.
 *
 * This triggers CRITICAL global risk (~100) and per-satellite risk for
 * LEO sunlit satellites (ISS, Hubble, etc.).
 *
 * Enable via DEMO_MODE=true in .env
 */

import type { DONKIFlare, DONKICME, NEOObject, FlarePathPrediction } from '@sentinel/shared';

import { logger } from './logger';
import {
    upsertSpaceWeather,
    upsertFlares,
    upsertCMEs,
    upsertNeos,
    saveFlarePathPredictions,
} from './dataCache';

const log = logger.child({ component: 'Demo' });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursAgo(h: number): string {
    return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

function daysFromNow(d: number): string {
    const date = new Date(Date.now() + d * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
}

// ---------------------------------------------------------------------------
// Fake SWPC data (matches real API response shapes)
// ---------------------------------------------------------------------------

/** X5.3 flare -- flux of 5.3e-4 W/m2 triggers X-class detection */
function makeFakeXrayData(): unknown[] {
    return [
        // The data extractor takes the LAST element in the array
        {
            time_tag: hoursAgo(0.1),
            flux: '5.3e-4',
            current_int_xrlong: '5.3e-4',
            energy: '0.1-0.8nm',
        },
    ];
}

/** Kp index 8 -- severe geomagnetic storm (G4) */
function makeFakeKpData(): unknown[] {
    return [
        ['time_tag', 'kp_index'],
        [hoursAgo(3), '8'],
        [hoursAgo(0), '8'],
    ];
}

/** Proton flux 150 pfu -- S2 radiation storm */
function makeFakeProtonData(): unknown[] {
    return [
        {
            time_tag: hoursAgo(0.1),
            flux: '150',
            proton_flux: '150',
            energy: '>=10 MeV',
        },
    ];
}

/** Solar wind 780 km/s -- very fast, enhanced magnetospheric compression */
function makeFakeSolarWindData(): unknown[] {
    return [
        ['time_tag', 'speed'],
        [hoursAgo(1), '650'],
        [hoursAgo(0), '780'],
    ];
}

/** IMF Bz -14 nT -- strongly southward, amplifies geomagnetic effects by 1.2x */
function makeFakeMagData(): unknown[] {
    return [
        ['time_tag', 'bt', 'bx_gsm', 'bz_gsm'],
        [hoursAgo(1), '16', '-3', '-12'],
        [hoursAgo(0), '18', '-2', '-14'],
    ];
}

// ---------------------------------------------------------------------------
// Fake DONKI data -- realistic flare & CME events
// ---------------------------------------------------------------------------

function makeFakeFlares(): DONKIFlare[] {
    return [
        {
            flrID: 'DEMO-FLR-X5.3-001',
            classType: 'X5.3',
            beginTime: hoursAgo(3),
            peakTime: hoursAgo(2),
            endTime: hoursAgo(1),
            sourceLocation: 'N15W25',
        },
        {
            flrID: 'DEMO-FLR-M7.1-002',
            classType: 'M7.1',
            beginTime: hoursAgo(8),
            peakTime: hoursAgo(7),
            endTime: hoursAgo(6),
            sourceLocation: 'S10E15',
        },
    ];
}

function makeFakeCMEs(): DONKICME[] {
    return [
        {
            activityID: 'DEMO-CME-001',
            startTime: hoursAgo(2.5),
            speed: 2100, // Very fast halo CME
            type: 'S',
        },
        {
            activityID: 'DEMO-CME-002',
            startTime: hoursAgo(12),
            speed: 1400,
            type: 'S',
        },
    ];
}

// ---------------------------------------------------------------------------
// Fake NEO -- potentially hazardous asteroid close approach
// ---------------------------------------------------------------------------

function makeFakeNeos(): NEOObject[] {
    return [
        {
            id: 'DEMO-NEO-001',
            name: '(2026 DX3) -- DEMO',
            estimatedDiameter: 0.42, // 420 meters
            isPotentiallyHazardous: true,
            closeApproachDate: daysFromNow(3),
            missDistanceKm: 1_850_000, // ~4.8 lunar distances
            relativeVelocityKmS: 18.7,
        },
    ];
}

// ---------------------------------------------------------------------------
// Fake Flare Path Predictions -- two Earth-directed CMEs from the X5.3 event
// ---------------------------------------------------------------------------

function hoursFromNow(h: number): string {
    return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
}

function makeFakeFlarePathPredictions(): FlarePathPrediction[] {
    const now = new Date().toISOString();
    return [
        {
            id: 'FPP-DEMO-CME-001',
            associatedCMEID: 'DEMO-CME-001',
            analysis: {
                time21_5: hoursAgo(2),
                latitude: 12,
                longitude: -18,
                halfAngle: 42,
                speed: 2100,
                type: 'S',
                isMostAccurate: true,
                associatedCMEID: 'DEMO-CME-001',
                note: 'Halo CME -- full Earth disk, high confidence direct hit',
                catalog: 'M2M_CATALOG',
            },
            coneLatitude: 12,
            coneLongitude: -18,
            coneHalfAngle: 42,
            coneSpeedKmS: 2100,
            estimatedArrivalTime: hoursFromNow(14),
            estimatedTransitHours: 16.5,
            arrivalWindowStart: hoursFromNow(12),
            arrivalWindowEnd: hoursFromNow(20),
            earthDirectedness: 'DIRECT_HIT',
            earthImpactProbability: 0.91,
            isEarthDirected: true,
            affectedSatellites: [
                {
                    noradId: 25544,
                    name: 'ISS (ZARYA)',
                    orbitRegime: 'LEO',
                    impactProbability: 0.87,
                    predictedPosition: { lat: 28.4, lng: -82.1, alt: 421 },
                    isSunlit: true,
                    isInSAA: false,
                    riskContribution: 22,
                    advisory: 'Enter safe mode — elevated radiation expected',
                },
                {
                    noradId: 20580,
                    name: 'HST',
                    orbitRegime: 'LEO',
                    impactProbability: 0.82,
                    predictedPosition: { lat: 24.1, lng: 15.7, alt: 540 },
                    isSunlit: true,
                    isInSAA: false,
                    riskContribution: 18,
                    advisory: 'Shutter instruments during arrival window',
                },
                {
                    noradId: 43013,
                    name: 'NOAA-20',
                    orbitRegime: 'LEO',
                    impactProbability: 0.79,
                    predictedPosition: { lat: -61.2, lng: 145.3, alt: 824 },
                    isSunlit: false,
                    isInSAA: true,
                    riskContribution: 25,
                    advisory: 'SAA crossing + CME arrival — consider safe mode',
                },
            ],
            generatedAt: now,
            confidence: 0.88,
        },
        {
            id: 'FPP-DEMO-CME-002',
            associatedCMEID: 'DEMO-CME-002',
            analysis: {
                time21_5: hoursAgo(11),
                latitude: -8,
                longitude: 22,
                halfAngle: 28,
                speed: 1400,
                type: 'S',
                isMostAccurate: true,
                associatedCMEID: 'DEMO-CME-002',
                note: 'Partial halo CME — glancing blow likely',
                catalog: 'M2M_CATALOG',
            },
            coneLatitude: -8,
            coneLongitude: 22,
            coneHalfAngle: 28,
            coneSpeedKmS: 1400,
            estimatedArrivalTime: hoursFromNow(30),
            estimatedTransitHours: 42,
            arrivalWindowStart: hoursFromNow(26),
            arrivalWindowEnd: hoursFromNow(38),
            earthDirectedness: 'GLANCING',
            earthImpactProbability: 0.48,
            isEarthDirected: true,
            affectedSatellites: [
                {
                    noradId: 25544,
                    name: 'ISS (ZARYA)',
                    orbitRegime: 'LEO',
                    impactProbability: 0.41,
                    predictedPosition: { lat: 51.6, lng: 60.2, alt: 421 },
                    isSunlit: true,
                    isInSAA: false,
                    riskContribution: 8,
                    advisory: 'Monitor — glancing CME arrival possible',
                },
            ],
            generatedAt: now,
            confidence: 0.61,
        },
    ];
}

// ---------------------------------------------------------------------------
// Main injection function
// ---------------------------------------------------------------------------

export async function injectDemoData(): Promise<void> {
    log.info('Injecting fake high-risk space weather data');
    log.info({ scenario: 'X5.3 flare + Kp 8 storm + 150 pfu protons + 780 km/s wind + Bz -14 nT' }, 'Demo scenario active');

    // Overlay fake SWPC readings (overwrites whatever the real pollers fetched)
    await Promise.all([
        upsertSpaceWeather('swpc-xray', makeFakeXrayData()),
        upsertSpaceWeather('swpc-kp', makeFakeKpData()),
        upsertSpaceWeather('swpc-protons', makeFakeProtonData()),
        upsertSpaceWeather('swpc-wind', makeFakeSolarWindData()),
        upsertSpaceWeather('swpc-mag', makeFakeMagData()),
    ]);

    // Inject fake DONKI flares & CMEs (merged with real data)
    await Promise.all([
        upsertFlares(makeFakeFlares()),
        upsertCMEs(makeFakeCMEs()),
        upsertNeos(makeFakeNeos()),
    ]);

    // Inject fake flare path predictions (bypasses flarePathPredictor which needs real CME analyses)
    await saveFlarePathPredictions(makeFakeFlarePathPredictions());

    log.info('Fake data injected, risk engine will compute CRITICAL scores');
    log.debug('Expected: Global score ~100 (CRITICAL), LEO sunlit satellites at HIGH/CRITICAL');
    log.debug('Expected compound bonuses: M5+/Kp>=5 (+15), Kp>=7/proton>=100 (+20), M5+/sunlit (+10)');
}
