import { z } from 'zod';

import { logger } from './logger';

const log = logger.child({ component: 'Env' });

const envSchema = z.object({
    // Optional -- agent works without all of these
    AGENT_PORT: z.coerce.number().default(3002),
    GATEWAY_URL: z.string().url().default('http://localhost:3001'),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),

    // External API keys (optional, graceful degradation without them)
    NASA_API_KEY: z.string().optional(),
    ANTHROPIC_API_KEY: z.string().optional(),

    // Inter-service auth
    INTERNAL_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.issues
            .map((i) => `  ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        // eslint-disable-next-line no-console
        console.error(`[Env] Validation failed:\n${errors}`);
        throw new Error(`Environment validation failed:\n${errors}`);
    }

    if (!result.data.NASA_API_KEY) {
        log.warn('NASA_API_KEY not set, using DEMO_KEY (30 req/hour limit)');
    }
    if (!result.data.ANTHROPIC_API_KEY) {
        log.warn('ANTHROPIC_API_KEY not set, LLM briefs will use deterministic fallback');
    }

    return result.data;
}
