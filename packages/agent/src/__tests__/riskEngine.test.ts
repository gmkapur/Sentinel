import { describe, it, expect } from 'vitest';

import {
    scoreToLevel,
    getFlareClass,
    scoreFlare,
    isM5Plus,
    scoreGeomagnetic,
    scoreRadiation,
    scoreSolarWind,
    scoreImfBz,
    scoreNeo,
    computeCompoundBonus,
} from '../riskEngine';

// ---------------------------------------------------------------------------
// scoreToLevel
// ---------------------------------------------------------------------------

describe('scoreToLevel', () => {
    it('returns LOW for scores 0-19', () => {
        expect(scoreToLevel(0)).toBe('LOW');
        expect(scoreToLevel(10)).toBe('LOW');
        expect(scoreToLevel(19)).toBe('LOW');
    });

    it('returns MODERATE for scores 20-39', () => {
        expect(scoreToLevel(20)).toBe('MODERATE');
        expect(scoreToLevel(30)).toBe('MODERATE');
        expect(scoreToLevel(39)).toBe('MODERATE');
    });

    it('returns HIGH for scores 40-69', () => {
        expect(scoreToLevel(40)).toBe('HIGH');
        expect(scoreToLevel(55)).toBe('HIGH');
        expect(scoreToLevel(69)).toBe('HIGH');
    });

    it('returns CRITICAL for scores 70+', () => {
        expect(scoreToLevel(70)).toBe('CRITICAL');
        expect(scoreToLevel(85)).toBe('CRITICAL');
        expect(scoreToLevel(100)).toBe('CRITICAL');
    });
});

// ---------------------------------------------------------------------------
// getFlareClass
// ---------------------------------------------------------------------------

describe('getFlareClass', () => {
    it('returns null for null input', () => {
        expect(getFlareClass(null)).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(getFlareClass('')).toBeNull();
    });

    it('returns null for invalid class', () => {
        expect(getFlareClass('Z5.0')).toBeNull();
        expect(getFlareClass('not a class')).toBeNull();
    });

    it('parses X-class flares', () => {
        expect(getFlareClass('X1.0')).toEqual({ letter: 'X', number: 1.0 });
        expect(getFlareClass('X10')).toEqual({ letter: 'X', number: 10 });
    });

    it('parses M-class flares', () => {
        expect(getFlareClass('M5.2')).toEqual({ letter: 'M', number: 5.2 });
        expect(getFlareClass('M1.0')).toEqual({ letter: 'M', number: 1.0 });
    });

    it('parses C-class flares', () => {
        expect(getFlareClass('C3.5')).toEqual({ letter: 'C', number: 3.5 });
    });

    it('parses B-class and A-class flares', () => {
        expect(getFlareClass('B2.0')).toEqual({ letter: 'B', number: 2.0 });
        expect(getFlareClass('A1.0')).toEqual({ letter: 'A', number: 1.0 });
    });

    it('handles case insensitivity', () => {
        expect(getFlareClass('x5.0')).toEqual({ letter: 'X', number: 5.0 });
        expect(getFlareClass('m2.3')).toEqual({ letter: 'M', number: 2.3 });
    });
});

// ---------------------------------------------------------------------------
// scoreFlare
// ---------------------------------------------------------------------------

describe('scoreFlare', () => {
    it('returns 0 for null', () => {
        expect(scoreFlare(null)).toBe(0);
    });

    it('returns 0 for B-class and A-class flares', () => {
        expect(scoreFlare('B2.0')).toBe(0);
        expect(scoreFlare('A1.0')).toBe(0);
    });

    it('returns 5 for C-class flares', () => {
        expect(scoreFlare('C3.5')).toBe(5);
        expect(scoreFlare('C1.0')).toBe(5);
    });

    it('returns 15 for M1-M4 flares', () => {
        expect(scoreFlare('M1.0')).toBe(15);
        expect(scoreFlare('M4.9')).toBe(15);
    });

    it('returns 25 for M5+ flares', () => {
        expect(scoreFlare('M5.0')).toBe(25);
        expect(scoreFlare('M9.9')).toBe(25);
    });

    it('returns 40 for X-class flares', () => {
        expect(scoreFlare('X1.0')).toBe(40);
        expect(scoreFlare('X20')).toBe(40);
    });
});

// ---------------------------------------------------------------------------
// isM5Plus
// ---------------------------------------------------------------------------

describe('isM5Plus', () => {
    it('returns false for null', () => {
        expect(isM5Plus(null)).toBe(false);
    });

    it('returns false for C-class and below', () => {
        expect(isM5Plus('C5.0')).toBe(false);
        expect(isM5Plus('B1.0')).toBe(false);
    });

    it('returns false for M1-M4', () => {
        expect(isM5Plus('M4.9')).toBe(false);
        expect(isM5Plus('M1.0')).toBe(false);
    });

    it('returns true for M5+', () => {
        expect(isM5Plus('M5.0')).toBe(true);
        expect(isM5Plus('M9.9')).toBe(true);
    });

    it('returns true for X-class', () => {
        expect(isM5Plus('X1.0')).toBe(true);
        expect(isM5Plus('X28')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// scoreGeomagnetic
// ---------------------------------------------------------------------------

describe('scoreGeomagnetic', () => {
    it('returns 0 for null', () => {
        expect(scoreGeomagnetic(null)).toBe(0);
    });

    it('returns 0 for Kp < 4', () => {
        expect(scoreGeomagnetic(0)).toBe(0);
        expect(scoreGeomagnetic(3)).toBe(0);
        expect(scoreGeomagnetic(3.9)).toBe(0);
    });

    it('returns 5 for Kp 4-4.9', () => {
        expect(scoreGeomagnetic(4)).toBe(5);
        expect(scoreGeomagnetic(4.5)).toBe(5);
    });

    it('returns 15 for Kp 5-6.9 (G1-G2)', () => {
        expect(scoreGeomagnetic(5)).toBe(15);
        expect(scoreGeomagnetic(6)).toBe(15);
    });

    it('returns 30 for Kp >= 7 (G3+)', () => {
        expect(scoreGeomagnetic(7)).toBe(30);
        expect(scoreGeomagnetic(9)).toBe(30);
    });
});

// ---------------------------------------------------------------------------
// scoreRadiation
// ---------------------------------------------------------------------------

describe('scoreRadiation', () => {
    it('returns 0 for null', () => {
        expect(scoreRadiation(null)).toBe(0);
    });

    it('returns 0 for proton flux < 1', () => {
        expect(scoreRadiation(0)).toBe(0);
        expect(scoreRadiation(0.5)).toBe(0);
    });

    it('returns 5 for proton flux 1-9.9', () => {
        expect(scoreRadiation(1)).toBe(5);
        expect(scoreRadiation(9)).toBe(5);
    });

    it('returns 15 for proton flux 10-99 (S1-S2)', () => {
        expect(scoreRadiation(10)).toBe(15);
        expect(scoreRadiation(50)).toBe(15);
    });

    it('returns 25 for proton flux >= 100 (S3+)', () => {
        expect(scoreRadiation(100)).toBe(25);
        expect(scoreRadiation(1000)).toBe(25);
    });
});

// ---------------------------------------------------------------------------
// scoreSolarWind
// ---------------------------------------------------------------------------

describe('scoreSolarWind', () => {
    it('returns 0 for null', () => {
        expect(scoreSolarWind(null)).toBe(0);
    });

    it('returns 0 for speed <= 500', () => {
        expect(scoreSolarWind(300)).toBe(0);
        expect(scoreSolarWind(500)).toBe(0);
    });

    it('returns 5 for speed 501-700', () => {
        expect(scoreSolarWind(501)).toBe(5);
        expect(scoreSolarWind(600)).toBe(5);
        expect(scoreSolarWind(700)).toBe(5);
    });

    it('returns 10 for speed > 700', () => {
        expect(scoreSolarWind(701)).toBe(10);
        expect(scoreSolarWind(1000)).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// scoreImfBz
// ---------------------------------------------------------------------------

describe('scoreImfBz', () => {
    it('returns 0 for null', () => {
        expect(scoreImfBz(null)).toBe(0);
    });

    it('returns 0 for Bz >= -5 (northward or weak southward)', () => {
        expect(scoreImfBz(5)).toBe(0);
        expect(scoreImfBz(0)).toBe(0);
        expect(scoreImfBz(-5)).toBe(0);
    });

    it('returns 5 for Bz between -10 and -5.1', () => {
        expect(scoreImfBz(-5.1)).toBe(5);
        expect(scoreImfBz(-8)).toBe(5);
        expect(scoreImfBz(-10)).toBe(5);
    });

    it('returns 10 for Bz < -10 (strong southward)', () => {
        expect(scoreImfBz(-10.1)).toBe(10);
        expect(scoreImfBz(-20)).toBe(10);
    });
});

// ---------------------------------------------------------------------------
// scoreNeo
// ---------------------------------------------------------------------------

describe('scoreNeo', () => {
    it('returns 0 when no PHA', () => {
        expect(scoreNeo(false)).toBe(0);
    });

    it('returns 5 when PHA detected', () => {
        expect(scoreNeo(true)).toBe(5);
    });
});

// ---------------------------------------------------------------------------
// computeCompoundBonus
// ---------------------------------------------------------------------------

describe('computeCompoundBonus', () => {
    it('returns 0 when no compound conditions met', () => {
        expect(computeCompoundBonus(null, null, null)).toBe(0);
        expect(computeCompoundBonus('C3.0', 3, 0.5)).toBe(0);
    });

    it('adds 10 for M5+ flare alone (sunlit exposure)', () => {
        expect(computeCompoundBonus('M5.0', null, null)).toBe(10);
        expect(computeCompoundBonus('X1.0', null, null)).toBe(10);
    });

    it('adds 15 + 10 for M5+ flare AND Kp >= 5 (CME-driven storm + sunlit)', () => {
        // M5+ + Kp>=5 = 15 bonus, plus M5+ alone = 10 bonus
        expect(computeCompoundBonus('M5.0', 5, null)).toBe(25);
    });

    it('adds 20 for Kp >= 7 AND proton flux >= 100', () => {
        expect(computeCompoundBonus(null, 7, 100)).toBe(20);
    });

    it('stacks all bonuses for worst-case scenario', () => {
        // X-class + Kp 8 + proton flux 200
        // M5+ (active): +10
        // M5+ AND Kp>=5: +15
        // Kp>=7 AND proton>=100: +20
        expect(computeCompoundBonus('X1.0', 8, 200)).toBe(45);
    });

    it('does not trigger M5+ bonuses for M4 flares', () => {
        expect(computeCompoundBonus('M4.9', 5, 100)).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// Integration-style scoring scenarios
// ---------------------------------------------------------------------------

describe('risk scoring scenarios', () => {
    it('nominal quiet sun produces LOW risk', () => {
        const total =
            scoreFlare(null) +
            scoreGeomagnetic(2) +
            scoreRadiation(0.1) +
            scoreSolarWind(350) +
            scoreImfBz(0) +
            scoreNeo(false) +
            computeCompoundBonus(null, 2, 0.1);

        expect(total).toBe(0);
        expect(scoreToLevel(total)).toBe('LOW');
    });

    it('M5 flare only produces MODERATE/HIGH risk', () => {
        const total =
            scoreFlare('M5.2') +
            scoreGeomagnetic(3) +
            scoreRadiation(0.5) +
            scoreSolarWind(400) +
            scoreImfBz(-3) +
            scoreNeo(false) +
            computeCompoundBonus('M5.2', 3, 0.5);

        // M5 flare = 25 + compound M5+ = 10 = 35
        expect(total).toBe(35);
        expect(scoreToLevel(total)).toBe('MODERATE');
    });

    it('May 2024 G5 storm scenario produces CRITICAL risk', () => {
        // X-class flare, Kp 9, proton flux 500, solar wind 900, Bz -25
        const total =
            scoreFlare('X5.0') +
            scoreGeomagnetic(9) +
            scoreRadiation(500) +
            scoreSolarWind(900) +
            scoreImfBz(-25) +
            scoreNeo(false) +
            computeCompoundBonus('X5.0', 9, 500);

        // X-class=40, Kp9=30, proton500=25, wind900=10, Bz-25=10, neo=0
        // Compound: M5++Kp5=15, Kp7+proton100=20, M5+=10 → 45
        // Total = 40+30+25+10+10+0+45 = 160 → capped at 100
        const capped = Math.min(total, 100);
        expect(capped).toBe(100);
        expect(scoreToLevel(capped)).toBe('CRITICAL');
    });
});
