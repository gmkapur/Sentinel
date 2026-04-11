import { describe, it, expect } from 'vitest';

import {
    classifyOrbit,
    isInSAA,
    getSubsolarPoint,
    getSolarZenithAngle,
    scoreFlareExposure,
    scoreGeomagnetic,
    scoreRadiation,
    scoreSolarWind,
    computeCompoundBonus,
    getBzMultiplier,
    computeSingleSatelliteRisk,
    computePerSatelliteRisk,
    getTopRiskSatellites,
} from '../satRisk';
import type { SatPosition, SpaceWeatherState } from '@sentinel/shared';

// ---------------------------------------------------------------------------
// classifyOrbit
// ---------------------------------------------------------------------------

describe('classifyOrbit', () => {
    it('classifies LEO (< 2000 km)', () => {
        expect(classifyOrbit(400)).toBe('LEO');
        expect(classifyOrbit(1999)).toBe('LEO');
    });

    it('classifies MEO (2000-35285 km)', () => {
        expect(classifyOrbit(2000)).toBe('MEO');
        expect(classifyOrbit(20200)).toBe('MEO');
    });

    it('classifies GEO (35286-36286 km)', () => {
        expect(classifyOrbit(35786)).toBe('GEO');
    });

    it('classifies HEO (> 36286 km)', () => {
        expect(classifyOrbit(40000)).toBe('HEO');
    });
});

// ---------------------------------------------------------------------------
// isInSAA
// ---------------------------------------------------------------------------

describe('isInSAA', () => {
    it('returns true for South Atlantic Anomaly region', () => {
        expect(isInSAA(-30, -25)).toBe(true);
        expect(isInSAA(-20, 0)).toBe(true);
    });

    it('returns false for points outside SAA', () => {
        expect(isInSAA(40, -74)).toBe(false); // New York
        expect(isInSAA(0, 100)).toBe(false); // Southeast Asia
    });

    it('returns false for boundary edges', () => {
        expect(isInSAA(-51, -25)).toBe(false); // below lat
        expect(isInSAA(-9, -25)).toBe(false); // above lat
        expect(isInSAA(-30, -91)).toBe(false); // left of lng
        expect(isInSAA(-30, 41)).toBe(false); // right of lng
    });
});

// ---------------------------------------------------------------------------
// getSubsolarPoint
// ---------------------------------------------------------------------------

describe('getSubsolarPoint', () => {
    it('returns latitude within ±23.44 degrees (axial tilt)', () => {
        const point = getSubsolarPoint(new Date());
        expect(point.lat).toBeGreaterThanOrEqual(-23.5);
        expect(point.lat).toBeLessThanOrEqual(23.5);
    });

    it('returns longitude within -180 to 180', () => {
        const point = getSubsolarPoint(new Date());
        expect(point.lng).toBeGreaterThanOrEqual(-180);
        expect(point.lng).toBeLessThanOrEqual(180);
    });
});

// ---------------------------------------------------------------------------
// getSolarZenithAngle
// ---------------------------------------------------------------------------

describe('getSolarZenithAngle', () => {
    it('returns 0 for satellite at subsolar point', () => {
        const subsolar = { lat: 10, lng: 50 };
        const angle = getSolarZenithAngle(10, 50, subsolar);
        expect(angle).toBeCloseTo(0, 5);
    });

    it('returns 90 for satellite on terminator', () => {
        const subsolar = { lat: 0, lng: 0 };
        const angle = getSolarZenithAngle(0, 90, subsolar);
        expect(angle).toBeCloseTo(90, 1);
    });

    it('returns 180 for satellite at anti-solar point', () => {
        const subsolar = { lat: 0, lng: 0 };
        const angle = getSolarZenithAngle(0, 180, subsolar);
        expect(angle).toBeCloseTo(180, 1);
    });
});

// ---------------------------------------------------------------------------
// scoreFlareExposure
// ---------------------------------------------------------------------------

describe('scoreFlareExposure', () => {
    it('returns 0 for null xray class', () => {
        const result = scoreFlareExposure(null, 45);
        expect(result.score).toBe(0);
        expect(result.threat).toBeNull();
    });

    it('returns full score for sunlit satellite (zenith < 90)', () => {
        const result = scoreFlareExposure('X1.0', 45);
        expect(result.score).toBe(40);
        expect(result.threat).toContain('sunlit');
    });

    it('returns half score for terminator satellite (90-100 zenith)', () => {
        const result = scoreFlareExposure('X1.0', 95);
        expect(result.score).toBe(20);
        expect(result.threat).toContain('terminator');
    });

    it('returns 0 for eclipse satellite (zenith > 100)', () => {
        const result = scoreFlareExposure('X1.0', 120);
        expect(result.score).toBe(0);
        expect(result.threat).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// scoreGeomagnetic (per-satellite)
// ---------------------------------------------------------------------------

describe('scoreGeomagnetic (per-satellite)', () => {
    it('returns 0 for non-LEO satellites', () => {
        expect(scoreGeomagnetic(8, 'GEO', 35786).score).toBe(0);
        expect(scoreGeomagnetic(8, 'MEO', 20200).score).toBe(0);
    });

    it('scores LEO satellites based on Kp', () => {
        expect(scoreGeomagnetic(7, 'LEO', 400).score).toBeGreaterThan(0);
    });

    it('amplifies score for low-LEO (< 500 km)', () => {
        const lowLeo = scoreGeomagnetic(7, 'LEO', 400);
        const highLeo = scoreGeomagnetic(7, 'LEO', 600);
        expect(lowLeo.score).toBeGreaterThan(highLeo.score);
    });
});

// ---------------------------------------------------------------------------
// scoreRadiation (per-satellite)
// ---------------------------------------------------------------------------

describe('scoreRadiation (per-satellite)', () => {
    it('adds SAA bonus for LEO satellites in SAA', () => {
        const inSaa = scoreRadiation(100, 'LEO', -30, -25);
        const outSaa = scoreRadiation(100, 'LEO', 40, -74);
        expect(inSaa.score).toBeGreaterThan(outSaa.score);
    });

    it('adds radiation belt bonus for MEO', () => {
        const meo = scoreRadiation(100, 'MEO', 0, 0);
        expect(meo.score).toBeGreaterThan(0);
        expect(meo.threat).toContain('radiation belt');
    });

    it('applies partial shielding for GEO', () => {
        const geo = scoreRadiation(100, 'GEO', 0, 0);
        const leo = scoreRadiation(100, 'LEO', 40, -74);
        expect(geo.score).toBeLessThan(leo.score);
    });
});

// ---------------------------------------------------------------------------
// scoreSolarWind (per-satellite)
// ---------------------------------------------------------------------------

describe('scoreSolarWind (per-satellite)', () => {
    it('only affects GEO satellites', () => {
        expect(scoreSolarWind(900, 'LEO').score).toBe(0);
        expect(scoreSolarWind(900, 'MEO').score).toBe(0);
        expect(scoreSolarWind(900, 'GEO').score).toBeGreaterThan(0);
    });
});

// ---------------------------------------------------------------------------
// getBzMultiplier
// ---------------------------------------------------------------------------

describe('getBzMultiplier', () => {
    it('returns 1.0 for null', () => {
        expect(getBzMultiplier(null)).toBe(1.0);
    });

    it('returns 1.0 for northward or weak southward Bz', () => {
        expect(getBzMultiplier(5)).toBe(1.0);
        expect(getBzMultiplier(0)).toBe(1.0);
        expect(getBzMultiplier(-5)).toBe(1.0);
    });

    it('returns 1.1 for moderate southward Bz (-5 to -10)', () => {
        expect(getBzMultiplier(-6)).toBe(1.1);
        expect(getBzMultiplier(-10)).toBe(1.1);
    });

    it('returns 1.2 for strong southward Bz (< -10)', () => {
        expect(getBzMultiplier(-11)).toBe(1.2);
        expect(getBzMultiplier(-20)).toBe(1.2);
    });
});

// ---------------------------------------------------------------------------
// computeCompoundBonus (per-satellite)
// ---------------------------------------------------------------------------

describe('computeCompoundBonus (per-satellite)', () => {
    it('requires LEO sunlit for flare+Kp compound', () => {
        const leoSunlit = computeCompoundBonus('X1', 6, null, 'LEO', true);
        const leoEclipse = computeCompoundBonus('X1', 6, null, 'LEO', false);
        expect(leoSunlit.score).toBeGreaterThan(leoEclipse.score);
    });

    it('stacks all bonuses for worst case', () => {
        const result = computeCompoundBonus('X1', 8, 200, 'LEO', true);
        // CME-driven storm (LEO sunlit) + severe radiation + sunlit exposure
        expect(result.score).toBe(45);
    });
});

// ---------------------------------------------------------------------------
// computeSingleSatelliteRisk
// ---------------------------------------------------------------------------

describe('computeSingleSatelliteRisk', () => {
    const baseSat: SatPosition = {
        id: 25544,
        name: 'ISS',
        lat: 20,
        lng: 30,
        alt: 420,
    };

    const quietWeather: SpaceWeatherState = {
        xrayClass: null,
        kpIndex: 2,
        protonFlux: 0.1,
        solarWindSpeed: 350,
        bz: 2,
        timestamp: new Date().toISOString(),
    };

    const stormWeather: SpaceWeatherState = {
        xrayClass: 'X5.0',
        kpIndex: 8,
        protonFlux: 200,
        solarWindSpeed: 800,
        bz: -15,
        timestamp: new Date().toISOString(),
    };

    it('assigns LOW risk in quiet conditions', () => {
        const subsolar = { lat: 0, lng: 180 }; // satellite in eclipse
        const result = computeSingleSatelliteRisk(
            baseSat,
            quietWeather,
            subsolar,
            [],
            [],
        );
        expect(result.riskLevel).toBe('LOW');
        expect(result.riskScore).toBeLessThan(20);
        expect(result.orbitRegime).toBe('LEO');
    });

    it('assigns HIGH/CRITICAL risk in storm conditions for sunlit LEO', () => {
        const subsolar = { lat: 20, lng: 30 }; // satellite at subsolar point
        const result = computeSingleSatelliteRisk(
            baseSat,
            stormWeather,
            subsolar,
            [],
            [],
        );
        expect(['HIGH', 'CRITICAL']).toContain(result.riskLevel);
        expect(result.riskScore).toBeGreaterThan(40);
        expect(result.threats!.length).toBeGreaterThan(0);
    });

    it('populates orbitRegime correctly', () => {
        const result = computeSingleSatelliteRisk(
            baseSat,
            quietWeather,
            { lat: 0, lng: 0 },
            [],
            [],
        );
        expect(result.orbitRegime).toBe('LEO');

        const geoSat = { ...baseSat, alt: 35786 };
        const geoResult = computeSingleSatelliteRisk(
            geoSat,
            quietWeather,
            { lat: 0, lng: 0 },
            [],
            [],
        );
        expect(geoResult.orbitRegime).toBe('GEO');
    });
});

// ---------------------------------------------------------------------------
// computePerSatelliteRisk (batch)
// ---------------------------------------------------------------------------

describe('computePerSatelliteRisk', () => {
    const sats: SatPosition[] = [
        { id: 25544, name: 'ISS', lat: 0, lng: 0, alt: 420 },
        { id: 36411, name: 'GOES-13', lat: 0, lng: -75, alt: 35786 },
    ];

    it('returns LOW for all satellites when weather is null', () => {
        const result = computePerSatelliteRisk(sats, null, []);
        expect(result).toHaveLength(2);
        expect(result.every((s) => s.riskLevel === 'LOW')).toBe(true);
    });

    it('enriches all satellites with risk data', () => {
        const weather: SpaceWeatherState = {
            xrayClass: null,
            kpIndex: 3,
            protonFlux: 0.5,
            solarWindSpeed: 400,
            bz: 0,
            timestamp: new Date().toISOString(),
        };
        const result = computePerSatelliteRisk(sats, weather, []);
        expect(result).toHaveLength(2);
        result.forEach((sat) => {
            expect(sat.orbitRegime).toBeDefined();
            expect(sat.riskScore).toBeDefined();
            expect(sat.riskLevel).toBeDefined();
        });
    });
});

// ---------------------------------------------------------------------------
// getTopRiskSatellites
// ---------------------------------------------------------------------------

describe('getTopRiskSatellites', () => {
    it('returns satellites sorted by risk score descending', () => {
        const enriched: SatPosition[] = [
            {
                id: 1,
                name: 'Sat-A',
                lat: 0,
                lng: 0,
                alt: 400,
                orbitRegime: 'LEO',
                riskScore: 20,
                riskLevel: 'MODERATE',
                threats: ['test'],
            },
            {
                id: 2,
                name: 'Sat-B',
                lat: 0,
                lng: 0,
                alt: 400,
                orbitRegime: 'LEO',
                riskScore: 60,
                riskLevel: 'HIGH',
                threats: ['test'],
            },
            {
                id: 3,
                name: 'Sat-C',
                lat: 0,
                lng: 0,
                alt: 400,
                orbitRegime: 'LEO',
                riskScore: 0,
                riskLevel: 'LOW',
                threats: [],
            },
        ];

        const top = getTopRiskSatellites(enriched, 10);
        expect(top).toHaveLength(2); // Sat-C excluded (score=0)
        expect(top[0].noradId).toBe(2); // highest first
        expect(top[1].noradId).toBe(1);
    });

    it('respects count limit', () => {
        const enriched: SatPosition[] = Array.from({ length: 20 }, (_, i) => ({
            id: i,
            name: `Sat-${i}`,
            lat: 0,
            lng: 0,
            alt: 400,
            orbitRegime: 'LEO' as const,
            riskScore: i + 1,
            riskLevel: 'MODERATE' as const,
            threats: [],
        }));

        const top = getTopRiskSatellites(enriched, 5);
        expect(top).toHaveLength(5);
    });
});
