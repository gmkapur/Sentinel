import type {
    CMEAnalysis,
    FlarePathPrediction,
    FlarePathImpact,
    SatPosition,
    SpaceWeatherState,
    OrbitRegime,
} from '@sentinel/shared';
import axios from 'axios';
import { logger } from './logger';
import {
    estimateTransitHours,
    computeArrivalWindow,
    assessEarthDirectedness,
    computeSatelliteCMEExposure,
} from './cmeGeometry';

const log = logger.child({ component: 'FlarePathPredictor' });

// ---------------------------------------------------------------------------
// Fetch satellite positions from the gateway
// ---------------------------------------------------------------------------

async function fetchSatellitePositions(): Promise<SatPosition[]> {
    try {
        const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001';
        const res = await axios.get(
            `${gatewayUrl}/internal/satellite-positions`,
            { timeout: 5_000 },
        );
        return res.data?.satellites ?? [];
    } catch {
        log.warn('Failed to fetch satellite positions from gateway');
        return [];
    }
}

// ---------------------------------------------------------------------------
// Orbit regime classification (mirrors gateway's satRisk.ts)
// ---------------------------------------------------------------------------

function classifyOrbit(altKm: number): OrbitRegime {
    if (altKm < 2000) return 'LEO';
    if (altKm < 35286) return 'MEO';
    if (altKm <= 36286) return 'GEO';
    return 'HEO';
}

// ---------------------------------------------------------------------------
// Per-satellite impact scoring
// ---------------------------------------------------------------------------

function computeImpactRiskContribution(
    exposure: number,
    regime: OrbitRegime,
    isSunlit: boolean,
    directedness: string,
    cmeSpeed: number,
): number {
    if (exposure === 0) return 0;

    // Speed-based severity
    let base = 0;
    if (cmeSpeed >= 2000) base = 25;
    else if (cmeSpeed >= 1500) base = 20;
    else if (cmeSpeed >= 1000) base = 15;
    else if (cmeSpeed >= 500) base = 10;

    // Earth-directedness multiplier
    const dirMult =
        directedness === 'DIRECT_HIT'
            ? 1.0
            : directedness === 'GLANCING'
              ? 0.6
              : 0.2;

    // Regime multiplier (MEO in radiation belts, LEO high particle flux)
    const regimeMult =
        regime === 'LEO'
            ? 1.2
            : regime === 'MEO'
              ? 1.3
              : regime === 'GEO'
                ? 0.8
                : 1.0;

    // Sunlit exposure multiplier
    const sunlitMult = isSunlit ? 1.3 : 0.7;

    return Math.round(base * exposure * dirMult * regimeMult * sunlitMult);
}

function generateAdvisory(
    regime: OrbitRegime,
    impactProb: number,
    isSunlit: boolean,
    riskContrib: number,
): string {
    if (riskContrib >= 20) {
        if (regime === 'LEO') return 'Enter safe mode; defer EVA operations';
        if (regime === 'MEO') return 'Activate radiation shielding protocols';
        if (regime === 'GEO') return 'Suspend sensitive electronics operations';
        return 'Monitor attitude control systems';
    }
    if (riskContrib >= 10) {
        if (isSunlit) return 'Reduce sunlit-side sensor exposure';
        return 'Monitor radiation levels closely';
    }
    if (impactProb > 0.3) {
        return 'Standby for possible CME impact';
    }
    return 'Continue nominal operations; monitor CME trajectory updates';
}

function computeConfidence(
    analysis: CMEAnalysis,
    earthProb: number,
): number {
    let confidence = 0.5;
    if (analysis.isMostAccurate) confidence += 0.2;
    if (analysis.speed >= 500 && analysis.speed <= 3000) confidence += 0.1;
    if (analysis.halfAngle >= 10 && analysis.halfAngle <= 90) confidence += 0.1;
    if (earthProb > 0.5) confidence += 0.1;
    return Math.min(confidence, 1.0);
}

// ---------------------------------------------------------------------------
// Main prediction pipeline
// ---------------------------------------------------------------------------

export async function generateFlarePathPredictions(
    analyses: CMEAnalysis[],
    weather: SpaceWeatherState,
): Promise<FlarePathPrediction[]> {
    if (analyses.length === 0) return [];

    const satellites = await fetchSatellitePositions();
    if (satellites.length === 0) {
        log.warn('No satellite positions available for flare path prediction');
    }

    const predictions: FlarePathPrediction[] = [];

    for (const analysis of analyses) {
        // Skip analyses without valid speed or half-angle
        if (analysis.speed < 300 || analysis.halfAngle <= 0) continue;

        // Assess Earth-directedness
        const { directedness, probability: earthProb } =
            assessEarthDirectedness(analysis);

        // Skip clear misses
        if (directedness === 'MISS' && earthProb < 0.05) continue;

        // Compute arrival window
        const arrival = computeArrivalWindow(analysis.time21_5, analysis.speed);

        // Skip if arrival window has already passed
        if (arrival.windowEnd < new Date()) continue;

        // Compute per-satellite impacts
        const impacts: FlarePathImpact[] = [];

        for (const sat of satellites) {
            const exposure = computeSatelliteCMEExposure(
                sat.lat,
                sat.lng,
                analysis.latitude,
                analysis.longitude,
                analysis.halfAngle,
            );

            if (exposure === 0 && earthProb < 0.3) continue;

            const regime = classifyOrbit(sat.alt);
            const isSunlit = sat.isSunlit ?? false;
            const isInSAA = sat.isInSAA ?? false;

            const impactProb = Math.min(
                1.0,
                earthProb * (0.5 + exposure * 0.5),
            );

            const riskContrib = computeImpactRiskContribution(
                exposure,
                regime,
                isSunlit,
                directedness,
                analysis.speed,
            );

            const advisory = generateAdvisory(
                regime,
                impactProb,
                isSunlit,
                riskContrib,
            );

            impacts.push({
                noradId: sat.id,
                name: sat.name,
                orbitRegime: regime,
                impactProbability: Math.round(impactProb * 100) / 100,
                predictedPosition: {
                    lat: sat.lat,
                    lng: sat.lng,
                    alt: sat.alt,
                },
                isSunlit,
                isInSAA,
                riskContribution: riskContrib,
                advisory,
            });
        }

        // Sort by impact probability descending
        impacts.sort((a, b) => b.impactProbability - a.impactProbability);

        const prediction: FlarePathPrediction = {
            id: `FPP-${analysis.associatedCMEID}`,
            associatedCMEID: analysis.associatedCMEID,
            analysis,
            coneLatitude: analysis.latitude,
            coneLongitude: analysis.longitude,
            coneHalfAngle: analysis.halfAngle,
            coneSpeedKmS: analysis.speed,
            estimatedArrivalTime: arrival.estimated.toISOString(),
            estimatedTransitHours:
                Math.round(arrival.transitHours * 10) / 10,
            arrivalWindowStart: arrival.windowStart.toISOString(),
            arrivalWindowEnd: arrival.windowEnd.toISOString(),
            earthDirectedness: directedness,
            earthImpactProbability: Math.round(earthProb * 100) / 100,
            isEarthDirected: earthProb > 0.3,
            affectedSatellites: impacts.slice(0, 50), // Cap to avoid huge payloads
            generatedAt: new Date().toISOString(),
            confidence: computeConfidence(analysis, earthProb),
        };

        predictions.push(prediction);
    }

    log.info(
        {
            totalAnalyses: analyses.length,
            predictions: predictions.length,
            earthDirected: predictions.filter((p) => p.isEarthDirected).length,
        },
        'Flare path predictions generated',
    );

    return predictions;
}
