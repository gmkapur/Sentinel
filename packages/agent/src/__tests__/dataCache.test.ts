import { describe, it, expect } from 'vitest';

import { classifyXrayFlux } from '../dataCache';

// ---------------------------------------------------------------------------
// classifyXrayFlux
// ---------------------------------------------------------------------------

describe('classifyXrayFlux', () => {
    it('classifies A-class flux (< 1e-7)', () => {
        expect(classifyXrayFlux(1e-8)).toBe('A');
        expect(classifyXrayFlux(5e-9)).toBe('A');
    });

    it('classifies B-class flux (1e-7 to 1e-6)', () => {
        const result = classifyXrayFlux(3e-7);
        expect(result).toMatch(/^B/);
    });

    it('classifies C-class flux (1e-6 to 1e-5)', () => {
        const result = classifyXrayFlux(5e-6);
        expect(result).toMatch(/^C/);
    });

    it('classifies M-class flux (1e-5 to 1e-4)', () => {
        const result = classifyXrayFlux(5e-5);
        expect(result).toMatch(/^M/);
    });

    it('classifies X-class flux (>= 1e-4)', () => {
        const result = classifyXrayFlux(1e-4);
        expect(result).toMatch(/^X/);
    });

    it('correctly labels M5 for 5e-5 flux', () => {
        const result = classifyXrayFlux(5e-5);
        expect(result).toBe('M5.0');
    });

    it('correctly labels X1 for 1e-4 flux', () => {
        const result = classifyXrayFlux(1e-4);
        expect(result).toBe('X1');
    });

    it('caps X-class at X99', () => {
        const result = classifyXrayFlux(1e-2); // X100 → capped at X99
        expect(result).toBe('X99');
    });
});
