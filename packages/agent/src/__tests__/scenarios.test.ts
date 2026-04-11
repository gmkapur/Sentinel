import { describe, it, expect } from 'vitest';

import {
    scoreToLevel,
    scoreFlare,
    scoreGeomagnetic,
    scoreRadiation,
    scoreSolarWind,
    scoreImfBz,
    scoreNeo,
    computeCompoundBonus,
} from '../riskEngine';
import { generateFallbackBrief } from '../llmBrief';
import type { RiskState, RiskBreakdown } from '@sentinel/shared';

import {
    g5StormWeather,
    quietSunWeather,
    moderateEventWeather,
} from './fixtures';

/**
 * End-to-end scenario tests using fixture data from real historical events.
 * Validates that the compound risk scoring model produces expected levels
 * for known space weather conditions.
 */

function computeFullScore(
    weather: {
        xrayClass: string | null;
        kpIndex: number | null;
        protonFlux: number | null;
        solarWindSpeed: number | null;
        bz: number | null;
    },
    hasPHA: boolean,
): { score: number; level: string; breakdown: RiskBreakdown } {
    const flare = scoreFlare(weather.xrayClass);
    const geomagnetic = scoreGeomagnetic(weather.kpIndex);
    const radiation = scoreRadiation(weather.protonFlux);
    const solarWind = scoreSolarWind(weather.solarWindSpeed);
    const imfBz = scoreImfBz(weather.bz);
    const neo = scoreNeo(hasPHA);
    const compound = computeCompoundBonus(
        weather.xrayClass,
        weather.kpIndex,
        weather.protonFlux,
    );

    const rawScore =
        flare + geomagnetic + radiation + solarWind + imfBz + neo + compound;
    const score = Math.min(rawScore, 100);
    const level = scoreToLevel(score);

    return {
        score,
        level,
        breakdown: {
            flare,
            geomagnetic,
            radiation,
            solarWind,
            imfBz,
            neo,
            compound,
        },
    };
}

// ---------------------------------------------------------------------------
// May 2024 G5 Storm — CRITICAL scenario
// ---------------------------------------------------------------------------

describe('Scenario: May 2024 G5 Geomagnetic Storm', () => {
    const result = computeFullScore(g5StormWeather, false);

    it('produces CRITICAL risk level', () => {
        expect(result.level).toBe('CRITICAL');
    });

    it('caps score at 100', () => {
        expect(result.score).toBe(100);
    });

    it('flags X-class flare contribution', () => {
        expect(result.breakdown.flare).toBe(40);
    });

    it('flags severe geomagnetic storm (Kp 9)', () => {
        expect(result.breakdown.geomagnetic).toBe(30);
    });

    it('flags severe radiation storm (500 pfu)', () => {
        expect(result.breakdown.radiation).toBe(25);
    });

    it('flags high solar wind (900 km/s)', () => {
        expect(result.breakdown.solarWind).toBe(10);
    });

    it('flags strong southward Bz (-25 nT)', () => {
        expect(result.breakdown.imfBz).toBe(10);
    });

    it('applies compound synergy bonus', () => {
        // X-class + Kp>=5 = 15, Kp>=7 + proton>=100 = 20, M5+ = 10
        expect(result.breakdown.compound).toBe(45);
    });

    it('generates NO-GO fallback brief', () => {
        const risk: RiskState = {
            score: result.score,
            level: result.level as RiskState['level'],
            breakdown: result.breakdown,
            timestamp: g5StormWeather.timestamp,
        };
        const brief = generateFallbackBrief(risk);
        expect(brief.recommendation).toBe('NO-GO');
        expect(brief.summary).toContain('CRITICAL');
    });
});

// ---------------------------------------------------------------------------
// Quiet Sun — LOW scenario
// ---------------------------------------------------------------------------

describe('Scenario: Quiet Sun (Nominal Conditions)', () => {
    const result = computeFullScore(quietSunWeather, false);

    it('produces LOW risk level', () => {
        expect(result.level).toBe('LOW');
    });

    it('produces score of 0', () => {
        expect(result.score).toBe(0);
    });

    it('has zero across all breakdown signals', () => {
        expect(result.breakdown.flare).toBe(0);
        expect(result.breakdown.geomagnetic).toBe(0);
        expect(result.breakdown.radiation).toBe(0);
        expect(result.breakdown.solarWind).toBe(0);
        expect(result.breakdown.imfBz).toBe(0);
        expect(result.breakdown.neo).toBe(0);
        expect(result.breakdown.compound).toBe(0);
    });

    it('generates GO fallback brief', () => {
        const risk: RiskState = {
            score: result.score,
            level: result.level as RiskState['level'],
            breakdown: result.breakdown,
            timestamp: quietSunWeather.timestamp,
        };
        const brief = generateFallbackBrief(risk);
        expect(brief.recommendation).toBe('GO');
    });
});

// ---------------------------------------------------------------------------
// Moderate M-class Flare — MODERATE scenario
// ---------------------------------------------------------------------------

describe('Scenario: Moderate M-class Flare Event', () => {
    const result = computeFullScore(moderateEventWeather, false);

    it('produces MODERATE risk level', () => {
        expect(result.level).toBe('MODERATE');
    });

    it('produces score between 20 and 39', () => {
        expect(result.score).toBeGreaterThanOrEqual(20);
        expect(result.score).toBeLessThanOrEqual(39);
    });

    it('generates CAUTION fallback brief', () => {
        const risk: RiskState = {
            score: result.score,
            level: result.level as RiskState['level'],
            breakdown: result.breakdown,
            timestamp: moderateEventWeather.timestamp,
        };
        const brief = generateFallbackBrief(risk);
        expect(brief.recommendation).toBe('CAUTION');
    });
});

// ---------------------------------------------------------------------------
// PHA scenario — adds NEO score
// ---------------------------------------------------------------------------

describe('Scenario: Potentially Hazardous Asteroid', () => {
    it('adds 5 points when PHA is within 7 days', () => {
        const withoutPHA = computeFullScore(quietSunWeather, false);
        const withPHA = computeFullScore(quietSunWeather, true);
        expect(withPHA.score - withoutPHA.score).toBe(5);
    });
});
