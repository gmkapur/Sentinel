import type { CMEAnalysis, CMEEarthDirectedness } from '@sentinel/shared';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const AU_KM = 149_597_870.7; // 1 AU in km
const SOLAR_RADII_21_5_KM = 21.5 * 696_000; // 21.5 solar radii in km

// ---------------------------------------------------------------------------
// CME Transit Time Estimation
// ---------------------------------------------------------------------------

/**
 * Estimate transit time from 21.5 solar radii to Earth (1 AU).
 * Uses empirical deceleration model: fast CMEs decelerate, slow ones accelerate
 * toward ambient solar wind speed (~400 km/s).
 *
 * References: Gopalswamy et al. (2001), Vrsnak & Zic (2007)
 */
export function estimateTransitHours(speedKmS: number): number {
    const ambientSpeed = 400; // km/s typical ambient solar wind
    // Empirical effective speed (accounts for drag deceleration/acceleration)
    const effectiveSpeed =
        speedKmS > ambientSpeed
            ? ambientSpeed + (speedKmS - ambientSpeed) * 0.65
            : speedKmS + (ambientSpeed - speedKmS) * 0.3;

    const distanceKm = AU_KM - SOLAR_RADII_21_5_KM;
    const transitSeconds = distanceKm / effectiveSpeed;
    return transitSeconds / 3600;
}

/**
 * Compute arrival window (start, end) from 21.5 solar radii measurement time.
 * Window: ±20% of estimated transit time.
 */
export function computeArrivalWindow(
    time21_5: string,
    speedKmS: number,
): {
    estimated: Date;
    windowStart: Date;
    windowEnd: Date;
    transitHours: number;
} {
    const transitHours = estimateTransitHours(speedKmS);
    const baseTime = new Date(time21_5);
    const estimatedMs = baseTime.getTime() + transitHours * 3_600_000;

    const marginMs = transitHours * 0.2 * 3_600_000; // 20% uncertainty window
    return {
        estimated: new Date(estimatedMs),
        windowStart: new Date(estimatedMs - marginMs),
        windowEnd: new Date(estimatedMs + marginMs),
        transitHours,
    };
}

// ---------------------------------------------------------------------------
// Earth-Directedness Assessment
// ---------------------------------------------------------------------------

/**
 * Assess whether a CME is Earth-directed based on HEEQ coordinates.
 * Earth sits at HEEQ longitude ~0. CME half-angle determines the cone width.
 */
export function assessEarthDirectedness(
    analysis: CMEAnalysis,
): { directedness: CMEEarthDirectedness; probability: number } {
    const toRad = Math.PI / 180;
    const lonDist = Math.abs(analysis.longitude);
    const latDist = Math.abs(analysis.latitude);

    // Effective angular separation (simplified spherical)
    const angularSep =
        Math.acos(
            Math.max(
                -1,
                Math.min(
                    1,
                    Math.cos(latDist * toRad) * Math.cos(lonDist * toRad),
                ),
            ),
        ) / toRad;

    const halfAngle = analysis.halfAngle;

    if (angularSep <= halfAngle * 0.5) {
        // Well within cone — direct hit
        const probability = Math.min(
            0.95,
            0.7 + ((halfAngle - angularSep) / halfAngle) * 0.25,
        );
        return { directedness: 'DIRECT_HIT', probability };
    }

    if (angularSep <= halfAngle) {
        // Within cone edge — glancing blow
        const edgeFraction = (halfAngle - angularSep) / halfAngle;
        const probability = 0.3 + edgeFraction * 0.4;
        return { directedness: 'GLANCING', probability };
    }

    if (angularSep <= halfAngle + 15) {
        // Near miss — small probability from cone uncertainty
        const probability = Math.max(
            0.05,
            0.3 * (1 - (angularSep - halfAngle) / 15),
        );
        return { directedness: 'MISS', probability };
    }

    return { directedness: 'MISS', probability: 0 };
}

// ---------------------------------------------------------------------------
// Satellite Impact Zone Check
// ---------------------------------------------------------------------------

/**
 * Check if a satellite at a given position would be within the CME impact zone.
 * Returns a fraction 0-1 indicating exposure (0 = outside, 1 = center of cone).
 */
export function computeSatelliteCMEExposure(
    satLat: number,
    satLng: number,
    cmeLat: number,
    cmeLon: number,
    halfAngle: number,
): number {
    const toRad = Math.PI / 180;

    const lat1 = satLat * toRad;
    const lat2 = cmeLat * toRad;
    // Negative because HEEQ is Sun-centered; Earth-facing direction is flipped
    const dLng = (satLng - -cmeLon) * toRad;

    const cosAngle =
        Math.sin(lat1) * Math.sin(lat2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.cos(dLng);

    const angularDist =
        Math.acos(Math.max(-1, Math.min(1, cosAngle))) / toRad;

    if (angularDist > halfAngle) return 0;

    // Linear falloff from center to edge
    return 1 - angularDist / halfAngle;
}
