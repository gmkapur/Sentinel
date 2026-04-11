/**
 * Benchmark: Per-satellite risk computation
 *
 * Measures the latency of computePerSatelliteRisk() with synthetic satellite
 * positions at various scales (1K, 5K, 10K satellites).
 *
 * Run: npx tsx bench/satRisk.bench.ts
 *
 * This validates the ARCHITECTURE.md claim that per-satellite risk computation
 * completes in <10ms for 5,000 satellites.
 */

import {
    computePerSatelliteRisk,
    getTopRiskSatellites,
} from '../packages/gateway/src/satRisk';
import type {
    SatPosition,
    SpaceWeatherState,
    NEOObject,
    ConjunctionEvent,
    FlarePathPrediction,
} from '../packages/shared/src/types';

// ---------------------------------------------------------------------------
// Synthetic data generators
// ---------------------------------------------------------------------------

function generateSatellites(count: number): SatPosition[] {
    const sats: SatPosition[] = [];
    for (let i = 0; i < count; i++) {
        // Distribute across LEO (60%), MEO (20%), GEO (15%), HEO (5%)
        let alt: number;
        const r = Math.random();
        if (r < 0.6) alt = 200 + Math.random() * 1800; // LEO: 200-2000 km
        else if (r < 0.8) alt = 2000 + Math.random() * 33000; // MEO: 2000-35000 km
        else if (r < 0.95) alt = 35286 + (Math.random() - 0.5) * 2000; // GEO: ~35286 km
        else alt = 36000 + Math.random() * 40000; // HEO: 36000-76000 km

        sats.push({
            id: 10000 + i,
            name: `BENCH-SAT-${i}`,
            lat: (Math.random() - 0.5) * 180,
            lng: (Math.random() - 0.5) * 360,
            alt,
        });
    }
    return sats;
}

// G5 storm weather (worst case)
const g5Weather: SpaceWeatherState = {
    xrayClass: 'X5.8',
    kpIndex: 9,
    protonFlux: 500,
    solarWindSpeed: 900,
    bz: -25,
    timestamp: new Date().toISOString(),
};

// Sample NEOs
const sampleNeos: NEOObject[] = [
    {
        id: 'neo1',
        name: 'BenchNEO-1',
        estimatedDiameter: 200,
        isPotentiallyHazardous: true,
        closeApproachDate: new Date().toISOString(),
        missDistanceKm: 7000,
        relativeVelocityKmS: 15,
    },
    {
        id: 'neo2',
        name: 'BenchNEO-2',
        estimatedDiameter: 50,
        isPotentiallyHazardous: false,
        closeApproachDate: new Date().toISOString(),
        missDistanceKm: 2_000_000,
        relativeVelocityKmS: 8,
    },
];

// Sample conjunctions
function generateConjunctions(sats: SatPosition[]): ConjunctionEvent[] {
    const conjs: ConjunctionEvent[] = [];
    for (let i = 0; i < Math.min(20, sats.length - 1); i++) {
        const s1 = sats[i];
        const s2 = sats[i + 1];
        conjs.push({
            id: `conj-${i}`,
            sat1Id: s1.id,
            sat1Name: s1.name,
            sat2Id: s2.id,
            sat2Name: s2.name,
            distanceKm: 1 + Math.random() * 50,
            severity: i < 5 ? 'CRITICAL' : i < 10 ? 'WARNING' : 'CLOSE_APPROACH',
            isIntraConstellation: false,
            sat1Regime: 'LEO',
            sat2Regime: 'LEO',
            sat1Position: { lat: s1.lat, lng: s1.lng, alt: s1.alt },
            sat2Position: { lat: s2.lat, lng: s2.lng, alt: s2.alt },
            timestamp: new Date().toISOString(),
        });
    }
    return conjs;
}

// Sample CME predictions
const samplePredictions: FlarePathPrediction[] = [
    {
        id: 'fpp-bench-1',
        associatedCMEID: 'cme-bench-1',
        analysis: {
            time21_5: new Date().toISOString(),
            latitude: 0,
            longitude: 0,
            halfAngle: 30,
            speed: 1500,
            type: 'C',
            isMostAccurate: true,
            associatedCMEID: 'cme-bench-1',
            note: 'Benchmark CME',
            catalog: 'BENCH',
        },
        coneLatitude: 0,
        coneLongitude: 0,
        coneHalfAngle: 30,
        coneSpeedKmS: 1500,
        estimatedArrivalTime: new Date(Date.now() + 12 * 3600000).toISOString(),
        estimatedTransitHours: 36,
        arrivalWindowStart: new Date(Date.now() + 6 * 3600000).toISOString(),
        arrivalWindowEnd: new Date(Date.now() + 48 * 3600000).toISOString(),
        earthDirectedness: 'DIRECT_HIT',
        earthImpactProbability: 0.8,
        isEarthDirected: true,
        affectedSatellites: [],
        generatedAt: new Date().toISOString(),
        confidence: 0.7,
    },
];

// ---------------------------------------------------------------------------
// Benchmark runner
// ---------------------------------------------------------------------------

function runBenchmark(
    label: string,
    count: number,
    iterations: number = 10,
): void {
    const sats = generateSatellites(count);
    const conjs = generateConjunctions(sats);

    // Warmup
    computePerSatelliteRisk(sats, g5Weather, sampleNeos, conjs, samplePredictions);

    const times: number[] = [];
    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const enriched = computePerSatelliteRisk(
            sats,
            g5Weather,
            sampleNeos,
            conjs,
            samplePredictions,
        );
        const end = performance.now();
        times.push(end - start);

        // Also benchmark getTopRiskSatellites on last iteration
        if (i === iterations - 1) {
            const topStart = performance.now();
            getTopRiskSatellites(enriched, 20);
            const topEnd = performance.now();
            console.log(
                `  getTopRiskSatellites(${count}): ${(topEnd - topStart).toFixed(2)} ms`,
            );
        }
    }

    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)];
    const p99 = times[Math.floor(times.length * 0.99)] ?? times[times.length - 1];
    const mean = times.reduce((a, b) => a + b, 0) / times.length;

    console.log(`${label} (${count} satellites, ${iterations} iterations):`);
    console.log(
        `  median: ${median.toFixed(2)} ms | p99: ${p99.toFixed(2)} ms | mean: ${mean.toFixed(2)} ms`,
    );
    console.log(
        `  per-satellite: ${(median / count * 1000).toFixed(1)} us/sat`,
    );
    console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('=== Orbit Sentinel: Per-Satellite Risk Benchmark ===\n');
console.log(`Platform: ${process.platform} ${process.arch}`);
console.log(`Node.js: ${process.version}`);
console.log(`Date: ${new Date().toISOString()}`);
console.log(`Weather scenario: G5 storm (worst case)`);
console.log(`Conjunctions: 20 synthetic events`);
console.log(`CME predictions: 1 Earth-directed DIRECT_HIT`);
console.log();

runBenchmark('Small fleet', 1_000, 20);
runBenchmark('Medium fleet', 5_000, 15);
runBenchmark('Large fleet', 10_000, 10);

console.log('=== Benchmark complete ===');
