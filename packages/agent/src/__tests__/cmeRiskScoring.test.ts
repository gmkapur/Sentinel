import { describe, it, expect } from 'vitest';
import {
    scoreCMEPath,
    computeCompoundBonus,
} from '../riskEngine';
import type { FlarePathPrediction } from '@sentinel/shared';

function makePrediction(overrides: Partial<FlarePathPrediction> = {}): FlarePathPrediction {
    return {
        id: 'FPP-TEST',
        associatedCMEID: 'CME-001',
        analysis: {
            time21_5: '2025-01-01T00:00:00Z',
            latitude: 0,
            longitude: 0,
            halfAngle: 45,
            speed: 1500,
            type: 'C',
            isMostAccurate: true,
            associatedCMEID: 'CME-001',
            note: '',
            catalog: 'ALL',
        },
        coneLatitude: 0,
        coneLongitude: 0,
        coneHalfAngle: 45,
        coneSpeedKmS: 1500,
        estimatedArrivalTime: new Date(Date.now() + 12 * 3_600_000).toISOString(), // 12h from now
        estimatedTransitHours: 24,
        arrivalWindowStart: new Date(Date.now() + 6 * 3_600_000).toISOString(),
        arrivalWindowEnd: new Date(Date.now() + 48 * 3_600_000).toISOString(),
        earthDirectedness: 'DIRECT_HIT',
        earthImpactProbability: 0.8,
        isEarthDirected: true,
        affectedSatellites: [],
        generatedAt: new Date().toISOString(),
        confidence: 0.7,
        ...overrides,
    };
}

describe('scoreCMEPath', () => {
    it('returns 0 for no predictions', () => {
        expect(scoreCMEPath([])).toBe(0);
    });

    it('returns 0 for non-earth-directed predictions', () => {
        const pred = makePrediction({ isEarthDirected: false });
        expect(scoreCMEPath([pred])).toBe(0);
    });

    it('returns positive score for earth-directed fast CME', () => {
        const pred = makePrediction({
            coneSpeedKmS: 2000,
            earthImpactProbability: 0.9,
            isEarthDirected: true,
        });
        expect(scoreCMEPath([pred])).toBeGreaterThan(0);
    });

    it('gives higher score for faster CMEs', () => {
        const slow = makePrediction({ coneSpeedKmS: 600, earthImpactProbability: 0.8 });
        const fast = makePrediction({ coneSpeedKmS: 2500, earthImpactProbability: 0.8 });
        expect(scoreCMEPath([fast])).toBeGreaterThan(scoreCMEPath([slow]));
    });

    it('gives imminence bonus for CMEs arriving within 6h', () => {
        const imminent = makePrediction({
            estimatedArrivalTime: new Date(Date.now() + 3 * 3_600_000).toISOString(),
            coneSpeedKmS: 1500,
            earthImpactProbability: 0.8,
        });
        const distant = makePrediction({
            estimatedArrivalTime: new Date(Date.now() + 48 * 3_600_000).toISOString(),
            coneSpeedKmS: 1500,
            earthImpactProbability: 0.8,
        });
        expect(scoreCMEPath([imminent])).toBeGreaterThan(scoreCMEPath([distant]));
    });
});

describe('computeCompoundBonus (CME synergy rules)', () => {
    it('adds bonus for CME Earth-directed + M5+ flare', () => {
        const preds = [makePrediction({ isEarthDirected: true })];
        const withCME = computeCompoundBonus('X1.0', 3, 5, preds);
        const noCME = computeCompoundBonus('X1.0', 3, 5, []);
        expect(withCME).toBeGreaterThan(noCME);
    });

    it('adds bonus for CME imminent + Kp >= 4', () => {
        const imminent = makePrediction({
            estimatedArrivalTime: new Date(Date.now() + 3 * 3_600_000).toISOString(),
            isEarthDirected: true,
        });
        const withImminent = computeCompoundBonus('C1.0', 5, 5, [imminent]);
        const noImminent = computeCompoundBonus('C1.0', 5, 5, []);
        expect(withImminent).toBeGreaterThan(noImminent);
    });

    it('adds bonus for multiple Earth-directed CMEs within 24h', () => {
        const pred1 = makePrediction({
            id: 'FPP-1',
            estimatedArrivalTime: new Date(Date.now() + 6 * 3_600_000).toISOString(),
            isEarthDirected: true,
        });
        const pred2 = makePrediction({
            id: 'FPP-2',
            estimatedArrivalTime: new Date(Date.now() + 12 * 3_600_000).toISOString(),
            isEarthDirected: true,
        });
        const multi = computeCompoundBonus('C1.0', 3, 5, [pred1, pred2]);
        const single = computeCompoundBonus('C1.0', 3, 5, [pred1]);
        expect(multi).toBeGreaterThan(single);
    });
});
