import { describe, it, expect } from 'vitest';
import {
    estimateTransitHours,
    computeArrivalWindow,
    assessEarthDirectedness,
    computeSatelliteCMEExposure,
} from '../cmeGeometry';
import type { CMEAnalysis } from '@sentinel/shared';

describe('cmeGeometry', () => {
    describe('estimateTransitHours', () => {
        it('returns reasonable transit for typical fast CME (~1500 km/s)', () => {
            const hours = estimateTransitHours(1500);
            // At 1500 km/s with drag, should take roughly 20-40 hours
            expect(hours).toBeGreaterThan(15);
            expect(hours).toBeLessThan(50);
        });

        it('returns longer transit for slow CME (~500 km/s)', () => {
            const slow = estimateTransitHours(500);
            const fast = estimateTransitHours(2000);
            expect(slow).toBeGreaterThan(fast);
        });

        it('handles very fast CME (>2500 km/s)', () => {
            const hours = estimateTransitHours(3000);
            expect(hours).toBeGreaterThan(10);
            expect(hours).toBeLessThan(30);
        });

        it('handles minimum speed', () => {
            const hours = estimateTransitHours(300);
            expect(hours).toBeGreaterThan(40);
        });
    });

    describe('computeArrivalWindow', () => {
        it('returns valid arrival window with start < estimated < end', () => {
            const time21_5 = new Date().toISOString();
            const result = computeArrivalWindow(time21_5, 1000);

            expect(result.windowStart.getTime()).toBeLessThan(
                result.estimated.getTime(),
            );
            expect(result.estimated.getTime()).toBeLessThan(
                result.windowEnd.getTime(),
            );
            expect(result.transitHours).toBeGreaterThan(0);
        });

        it('window end is after window start', () => {
            const result = computeArrivalWindow('2025-01-01T00:00:00Z', 1500);
            expect(result.windowEnd.getTime()).toBeGreaterThan(
                result.windowStart.getTime(),
            );
        });
    });

    describe('assessEarthDirectedness', () => {
        const baseAnalysis: CMEAnalysis = {
            time21_5: '2025-01-01T00:00:00Z',
            latitude: 0,
            longitude: 0,
            halfAngle: 45,
            speed: 1000,
            type: 'C',
            isMostAccurate: true,
            associatedCMEID: 'CME-001',
            note: '',
            catalog: 'ALL',
        };

        it('classifies direct hit for Earth-facing CME (lon≈0, lat≈0, wide cone)', () => {
            const result = assessEarthDirectedness({
                ...baseAnalysis,
                latitude: 0,
                longitude: 0,
                halfAngle: 45,
            });
            expect(result.directedness).toBe('DIRECT_HIT');
            expect(result.probability).toBeGreaterThan(0.5);
        });

        it('classifies miss for limb CME (lon=90)', () => {
            const result = assessEarthDirectedness({
                ...baseAnalysis,
                latitude: 0,
                longitude: 90,
                halfAngle: 20,
            });
            expect(result.directedness).toBe('MISS');
            expect(result.probability).toBeLessThan(0.3);
        });

        it('classifies glancing for CME offset by half the cone angle', () => {
            const result = assessEarthDirectedness({
                ...baseAnalysis,
                latitude: 0,
                longitude: 35,
                halfAngle: 45,
            });
            expect(['DIRECT_HIT', 'GLANCING']).toContain(result.directedness);
        });

        it('returns higher probability for wider cones', () => {
            const narrow = assessEarthDirectedness({
                ...baseAnalysis,
                longitude: 20,
                halfAngle: 15,
            });
            const wide = assessEarthDirectedness({
                ...baseAnalysis,
                longitude: 20,
                halfAngle: 60,
            });
            expect(wide.probability).toBeGreaterThan(narrow.probability);
        });
    });

    describe('computeSatelliteCMEExposure', () => {
        it('returns 1.0 for satellite at exact cone center', () => {
            const exposure = computeSatelliteCMEExposure(0, 0, 0, 0, 45);
            expect(exposure).toBe(1.0);
        });

        it('returns 0 for satellite far outside cone', () => {
            const exposure = computeSatelliteCMEExposure(80, 80, 0, 0, 10);
            expect(exposure).toBe(0);
        });

        it('returns intermediate value for satellite at cone edge', () => {
            // Satellite at roughly half the cone angle from center
            const exposure = computeSatelliteCMEExposure(20, 0, 0, 0, 45);
            expect(exposure).toBeGreaterThan(0);
            expect(exposure).toBeLessThan(1);
        });

        it('returns decreasing exposure as satellite moves away from center', () => {
            const close = computeSatelliteCMEExposure(5, 0, 0, 0, 45);
            const mid = computeSatelliteCMEExposure(20, 0, 0, 0, 45);
            const far = computeSatelliteCMEExposure(40, 0, 0, 0, 45);
            expect(close).toBeGreaterThan(mid);
            expect(mid).toBeGreaterThan(far);
        });
    });
});
