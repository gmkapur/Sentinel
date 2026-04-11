import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Env } from './env';

// ---------------------------------------------------------------------------
// Security headers via helmet
// ---------------------------------------------------------------------------

export const securityHeaders = helmet({
    contentSecurityPolicy: false, // CSP managed by frontend bundler
    crossOriginEmbedderPolicy: false, // Allow globe.gl assets
});

// ---------------------------------------------------------------------------
// Rate limiting — protects public API endpoints
// ---------------------------------------------------------------------------

export const apiRateLimit = rateLimit({
    windowMs: 60 * 1000, // 1-minute window
    max: 120, // 120 requests per minute per IP
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
});

// ---------------------------------------------------------------------------
// API key auth — protects /api/* routes (disabled in demo mode)
// ---------------------------------------------------------------------------

export function requireApiKey(env: Env) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (env.DEMO_MODE) {
            next();
            return;
        }

        const key = req.header('x-api-key');
        if (!key) {
            res.status(401).json({ error: 'Missing x-api-key header' });
            return;
        }
        if (key !== env.API_KEY) {
            res.status(403).json({ error: 'Invalid API key' });
            return;
        }
        next();
    };
}

// ---------------------------------------------------------------------------
// Internal secret auth — protects /internal/* routes (disabled in demo mode)
// ---------------------------------------------------------------------------

export function requireInternalSecret(env: Env) {
    return (req: Request, res: Response, next: NextFunction): void => {
        if (env.DEMO_MODE) {
            next();
            return;
        }

        const secret = req.header('x-internal-secret');
        if (!secret) {
            res.status(401).json({ error: 'Missing x-internal-secret header' });
            return;
        }
        if (secret !== env.INTERNAL_SECRET) {
            res.status(403).json({ error: 'Invalid internal secret' });
            return;
        }
        next();
    };
}

// ---------------------------------------------------------------------------
// Centralized error handler — catches unhandled route errors
// ---------------------------------------------------------------------------

export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction,
): void {
    console.error(`[Error] Unhandled: ${err.message}`);

    const status = (err as Error & { status?: number }).status ?? 500;
    res.status(status).json({
        error:
            process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message,
    });
}

// ---------------------------------------------------------------------------
// Request logger — lightweight structured logging
// ---------------------------------------------------------------------------

export function requestLogger(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        const level = res.statusCode >= 400 ? 'warn' : 'info';
        const log = `[HTTP] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`;

        if (level === 'warn') {
            console.warn(log);
        } else if (duration > 1000) {
            console.warn(`${log} (slow)`);
        }
    });

    next();
}
