import pino, { type Logger, type LoggerOptions } from 'pino';

export type { Logger } from 'pino';

export interface CreateLoggerOptions {
    /** Service name — appears in every log line as "service" field */
    service: 'agent' | 'gateway';
    /** Override log level. Defaults to 'debug' in development, 'info' in production */
    level?: string;
}

/**
 * Creates a root pino logger for a service. Call once at service startup.
 *
 * Dev: pretty-prints via pino-pretty (colorized, timestamped).
 * Prod: raw JSON output for log aggregators.
 *
 * Usage:
 *   const logger = createLogger({ service: 'gateway' });
 *   const dbLog = logger.child({ component: 'db' });
 *   dbLog.info('Connected to PostgreSQL');
 */
export function createLogger(opts: CreateLoggerOptions): Logger {
    const isDev = process.env.NODE_ENV !== 'production';
    const level = opts.level ?? process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info');

    const options: LoggerOptions = {
        level,
        base: {
            service: opts.service,
            pid: process.pid,
        },
        timestamp: pino.stdTimeFunctions.isoTime,
        serializers: {
            err: pino.stdSerializers.err,
            req: pino.stdSerializers.req,
            res: pino.stdSerializers.res,
        },
    };

    if (isDev) {
        options.transport = {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'HH:MM:ss.l',
                ignore: 'pid,hostname',
            },
        };
    }

    return pino(options);
}
