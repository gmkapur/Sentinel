import { z } from 'zod';
import { logger } from './logger';

const log = logger.child({ component: 'Env' });

const envSchema = z.object({
    // Required
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

    // Optional with defaults
    GATEWAY_PORT: z.coerce.number().default(3001),
    AGENT_URL: z.string().url().default('http://localhost:3002'),
    NODE_ENV: z
        .enum(['development', 'production', 'test'])
        .default('development'),

    // Auth — disabled when DEMO_MODE is true
    DEMO_MODE: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
    API_KEY: z.string().optional(),
    INTERNAL_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(): Env {
    const result = envSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.issues
            .map((i) => `  ${i.path.join('.')}: ${i.message}`)
            .join('\n');
        // eslint-disable-next-line no-console -- Logger may not be initialized during env validation failure
        console.error(`[Env] Validation failed:\n${errors}`);
        throw new Error(`Environment validation failed:\n${errors}`);
    }

    const env = result.data;

    if (!env.DEMO_MODE) {
        if (!env.API_KEY) {
            log.warn('API_KEY not set — public API routes will reject requests');
        }
        if (!env.INTERNAL_SECRET) {
            log.warn('INTERNAL_SECRET not set — internal routes will reject requests');
        }
    } else {
        log.info('DEMO_MODE enabled — auth checks are disabled');
    }

    return env;
}
