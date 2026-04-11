import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { validateEnv } from '../env';

describe('validateEnv', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        // Reset env before each test
    });

    afterEach(() => {
        process.env = { ...originalEnv };
    });

    it('succeeds with required env vars set', () => {
        expect(() => validateEnv()).not.toThrow();
    });

    it('applies default port when AGENT_PORT is not set', () => {
        delete process.env.AGENT_PORT;
        const env = validateEnv();
        expect(env.AGENT_PORT).toBe(3002);
    });

    it('parses AGENT_PORT as number', () => {
        process.env.AGENT_PORT = '4000';
        const env = validateEnv();
        expect(env.AGENT_PORT).toBe(4000);
    });

    it('applies default GATEWAY_URL', () => {
        delete process.env.GATEWAY_URL;
        const env = validateEnv();
        expect(env.GATEWAY_URL).toBe('http://localhost:3001');
    });

    it('sets DEMO_MODE to false by default', () => {
        delete process.env.DEMO_MODE;
        const env = validateEnv();
        expect(env.DEMO_MODE).toBe(false);
    });

    it('parses DEMO_MODE=true correctly', () => {
        process.env.DEMO_MODE = 'true';
        const env = validateEnv();
        expect(env.DEMO_MODE).toBe(true);
    });
});
