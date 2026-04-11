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

    it('defaults NODE_ENV to development', () => {
        delete process.env.NODE_ENV;
        const env = validateEnv();
        expect(env.NODE_ENV).toBe('development');
    });

    it('accepts valid NODE_ENV values', () => {
        process.env.NODE_ENV = 'production';
        const env = validateEnv();
        expect(env.NODE_ENV).toBe('production');
    });

    it('treats missing API keys as optional (graceful degradation)', () => {
        delete process.env.NASA_API_KEY;
        delete process.env.ANTHROPIC_API_KEY;
        const env = validateEnv();
        expect(env.NASA_API_KEY).toBeUndefined();
        expect(env.ANTHROPIC_API_KEY).toBeUndefined();
    });
});
