import { timingSafeEqual } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { Logger } from '@sentinel/shared';
import type { Env } from './env';

// Constant-time string comparison to prevent timing attacks
function safeCompare(a: string, b: string): boolean {
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) {
        // Compare against self to keep timing consistent regardless of length
        timingSafeEqual(aBuf, aBuf);
        return false;
    }
    return timingSafeEqual(aBuf, bBuf);
}

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
// API key auth — protects /api/v1/* routes
// Bypassed in development mode (NODE_ENV=development) to simplify local dev.
// Always enforced in production.
// ---------------------------------------------------------------------------

export function requireApiKey(env: Env) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // In development, skip API key check for convenience
        if (env.NODE_ENV === 'development') {
            next();
            return;
        }

        const key = req.header('x-api-key');
        if (!key) {
            res.status(401).json({ error: 'Missing x-api-key header' });
            return;
        }
        if (!env.API_KEY || !safeCompare(key, env.API_KEY)) {
            res.status(403).json({ error: 'Invalid API key' });
            return;
        }
        next();
    };
}

// ---------------------------------------------------------------------------
// Internal secret auth — protects /internal/* routes
// ALWAYS enforced regardless of environment — agent-to-gateway communication
// must be authenticated even in development.
// ---------------------------------------------------------------------------

export function requireInternalSecret(env: Env) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const secret = req.header('x-internal-secret');
        if (!secret) {
            res.status(401).json({ error: 'Missing x-internal-secret header' });
            return;
        }
        if (!env.INTERNAL_SECRET || !safeCompare(secret, env.INTERNAL_SECRET)) {
            res.status(403).json({ error: 'Invalid internal secret' });
            return;
        }
        next();
    };
}

// ---------------------------------------------------------------------------
// Centralized error handler — catches unhandled route errors
// ---------------------------------------------------------------------------

export function createErrorHandler(log: Logger) {
    const errLog = log.child({ component: 'Error' });

    return function errorHandler(
        err: Error,
        _req: Request,
        res: Response,
        _next: NextFunction,
    ): void {
        const status = (err as Error & { status?: number }).status ?? 500;
        errLog.error({ err, statusCode: status }, 'Unhandled route error');
        res.status(status).json({
            error:
                process.env.NODE_ENV === 'production'
                    ? 'Internal server error'
                    : err.message,
        });
    };
}

// ---------------------------------------------------------------------------
// Request logger — structured HTTP request/response logging
// ---------------------------------------------------------------------------

export function createRequestLogger(log: Logger) {
    const httpLog = log.child({ component: 'HTTP' });

    return function requestLogger(
        req: Request,
        res: Response,
        next: NextFunction,
    ): void {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            const logData = {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                duration,
                contentLength: res.get('content-length'),
                userAgent: req.get('user-agent'),
            };

            if (res.statusCode >= 500) {
                httpLog.error(logData, 'Request failed');
            } else if (res.statusCode >= 400) {
                httpLog.warn(logData, 'Client error');
            } else if (duration > 1000) {
                httpLog.warn({ ...logData, slow: true }, 'Slow request');
            } else {
                httpLog.info(logData, 'Request completed');
            }
        });

        next();
    };
}
