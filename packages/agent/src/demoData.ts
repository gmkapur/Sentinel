/**
 * Demo Mode — Injects fake high-risk space weather data into the agent cache
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

import type { DONKIFlare, DONKICME, NEOObject } from '@sentinel/shared';

import {
    upsertSpaceWeather,
    upsertFlares,
    upsertCMEs,
    upsertNeos,
} from './dataCache';

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

/** X5.3 flare — flux of 5.3e-4 W/m² triggers X-class detection */
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

/** Kp index 8 — severe geomagnetic storm (G4) */
function makeFakeKpData(): unknown[] {
    return [
        ['time_tag', 'kp_index'],
        [hoursAgo(3), '8'],
        [hoursAgo(0), '8'],
    ];
}

/** Proton flux 150 pfu — S2 radiation storm */
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

/** Solar wind 780 km/s — very fast, enhanced magnetospheric compression */
function makeFakeSolarWindData(): unknown[] {
    return [
        ['time_tag', 'speed'],
        [hoursAgo(1), '650'],
        [hoursAgo(0), '780'],
    ];
}

/** IMF Bz -14 nT — strongly southward, amplifies geomagnetic effects by 1.2x */
function makeFakeMagData(): unknown[] {
    return [
        ['time_tag', 'bt', 'bx_gsm', 'bz_gsm'],
        [hoursAgo(1), '16', '-3', '-12'],
        [hoursAgo(0), '18', '-2', '-14'],
    ];
}

// ---------------------------------------------------------------------------
// Fake DONKI data — realistic flare & CME events
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
// Fake NEO — potentially hazardous asteroid close approach
// ---------------------------------------------------------------------------

function makeFakeNeos(): NEOObject[] {
    return [
        {
            id: 'DEMO-NEO-001',
            name: '(2026 DX3) — DEMO',
            estimatedDiameter: 0.42, // 420 meters
            isPotentiallyHazardous: true,
            closeApproachDate: daysFromNow(3),
            missDistanceKm: 1_850_000, // ~4.8 lunar distances
            relativeVelocityKmS: 18.7,
        },
    ];
}

// ---------------------------------------------------------------------------
// Main injection function
// ---------------------------------------------------------------------------

export async function injectDemoData(): Promise<void> {
    console.log('[DEMO] Injecting fake high-risk space weather data...');
    console.log(
        '[DEMO] Scenario: X5.3 flare + Kp 8 storm + 150 pfu protons + 780 km/s wind + Bz -14 nT',
    );

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

    console.log(
        '[DEMO] Fake data injected — risk engine will compute CRITICAL scores',
    );
    console.log(
        '[DEMO] Expected: Global score ~100 (CRITICAL), LEO sunlit satellites at HIGH/CRITICAL',
    );
    console.log(
        '[DEMO] Compound bonuses: M5+/Kp≥5 (+15), Kp≥7/proton≥100 (+20), M5+/sunlit (+10)',
    );
}
