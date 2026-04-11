import { describe, it, expect, beforeEach, afterAll } from 'vitest';

import { shouldGenerateBrief, generateFallbackBrief } from '../llmBrief';
import type { RiskState } from '@sentinel/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRisk(overrides: Partial<RiskState> = {}): RiskState {
    return {
        score: 10,
        level: 'LOW',
        breakdown: {
            flare: 0,
            geomagnetic: 0,
            radiation: 0,
            solarWind: 0,
            imfBz: 0,
            neo: 0,
            cmePath: 0,
            compound: 0,
        },
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

// ---------------------------------------------------------------------------
// shouldGenerateBrief
// ---------------------------------------------------------------------------

describe('shouldGenerateBrief', () => {
    const originalEnv = process.env.ANTHROPIC_API_KEY;

    beforeEach(() => {
        process.env.ANTHROPIC_API_KEY = 'test-key';
    });

    it('returns false when ANTHROPIC_API_KEY is not set', () => {
        delete process.env.ANTHROPIC_API_KEY;
        const current = makeRisk();
        expect(shouldGenerateBrief(current, null, null)).toBe(false);
    });

    it('returns true when no previous risk assessment exists', () => {
        const current = makeRisk();
        expect(shouldGenerateBrief(current, null, null)).toBe(true);
    });

    it('returns true when risk level changes', () => {
        const current = makeRisk({ level: 'HIGH', score: 50 });
        const previous = makeRisk({ level: 'LOW', score: 10 });
        expect(shouldGenerateBrief(current, previous, new Date())).toBe(true);
    });

    it('returns true when score delta >= 15', () => {
        const current = makeRisk({ score: 30 });
        const previous = makeRisk({ score: 10 });
        expect(shouldGenerateBrief(current, previous, new Date())).toBe(true);
    });

    it('returns false when score delta < 15 and level unchanged', () => {
        const current = makeRisk({ score: 15 });
        const previous = makeRisk({ score: 10 });
        expect(shouldGenerateBrief(current, previous, new Date())).toBe(false);
    });

    it('returns true when 30-minute heartbeat has elapsed', () => {
        const current = makeRisk({ score: 10 });
        const previous = makeRisk({ score: 10 });
        const thirtyOneMinAgo = new Date(Date.now() - 31 * 60 * 1000);
        expect(shouldGenerateBrief(current, previous, thirtyOneMinAgo)).toBe(
            true,
        );
    });

    it('returns false when heartbeat has not elapsed', () => {
        const current = makeRisk({ score: 10 });
        const previous = makeRisk({ score: 10 });
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
        expect(shouldGenerateBrief(current, previous, fiveMinAgo)).toBe(false);
    });

    it('returns true when lastBriefAt is null', () => {
        const current = makeRisk({ score: 10 });
        const previous = makeRisk({ score: 10 });
        expect(shouldGenerateBrief(current, previous, null)).toBe(true);
    });

    // Restore env after tests
    afterAll(() => {
        if (originalEnv) {
            process.env.ANTHROPIC_API_KEY = originalEnv;
        } else {
            delete process.env.ANTHROPIC_API_KEY;
        }
    });
});

// ---------------------------------------------------------------------------
// generateFallbackBrief
// ---------------------------------------------------------------------------

describe('generateFallbackBrief', () => {
    it('generates GO brief for LOW risk', () => {
        const risk = makeRisk({ level: 'LOW', score: 5 });
        const brief = generateFallbackBrief(risk);

        expect(brief.recommendation).toBe('GO');
        expect(brief.isLlm).toBe(false);
        expect(brief.confidence).toBe(0.9);
        expect(brief.threats).toHaveLength(0);
        expect(brief.maneuverWindows).toContain(
            'All operational windows are clear',
        );
    });

    it('generates CAUTION brief for MODERATE risk', () => {
        const risk = makeRisk({
            level: 'MODERATE',
            score: 25,
            breakdown: {
                flare: 15,
                geomagnetic: 5,
                radiation: 5,
                solarWind: 0,
                imfBz: 0,
                neo: 0,
                cmePath: 0,
                compound: 0,
            },
        });
        const brief = generateFallbackBrief(risk);

        expect(brief.recommendation).toBe('CAUTION');
        expect(brief.isLlm).toBe(false);
        expect(brief.confidence).toBe(0.7);
        expect(brief.threats.length).toBeGreaterThan(0);
    });

    it('generates NO-GO brief for HIGH risk', () => {
        const risk = makeRisk({
            level: 'HIGH',
            score: 55,
            breakdown: {
                flare: 25,
                geomagnetic: 15,
                radiation: 5,
                solarWind: 0,
                imfBz: 0,
                neo: 0,
                cmePath: 0,
                compound: 10,
            },
        });
        const brief = generateFallbackBrief(risk);

        expect(brief.recommendation).toBe('NO-GO');
        expect(brief.threats).toContain(
            'Strong solar flare activity (M5+ class or higher)',
        );
        expect(brief.threats).toContain(
            'Geomagnetic storm conditions (Kp ≥ 5)',
        );
    });

    it('generates NO-GO brief for CRITICAL risk', () => {
        const risk = makeRisk({
            level: 'CRITICAL',
            score: 95,
            breakdown: {
                flare: 40,
                geomagnetic: 30,
                radiation: 25,
                solarWind: 0,
                imfBz: 0,
                neo: 0,
                cmePath: 0,
                compound: 0,
            },
        });
        const brief = generateFallbackBrief(risk);

        expect(brief.recommendation).toBe('NO-GO');
        expect(brief.threats).toContain('X-class solar flare active');
        expect(brief.threats).toContain(
            'Severe geomagnetic storm (Kp ≥ 7, G3+)',
        );
    });

    it('always includes generatedAt timestamp', () => {
        const risk = makeRisk();
        const brief = generateFallbackBrief(risk);

        expect(brief.generatedAt).toBeDefined();
        expect(() => new Date(brief.generatedAt)).not.toThrow();
    });
});
