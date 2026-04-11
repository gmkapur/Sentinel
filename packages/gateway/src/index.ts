import dotenv from 'dotenv';
import path from 'path';

// Load root .env (CWD is packages/gateway when run via `npm run dev`)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { createServer } from 'http';

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import prisma, { disconnectDb } from './db';
import { hydrateFromDb, getLatestState } from './agentState';
import { createRouter } from './routes';
import { refreshTles, startTleRefreshLoop, propagateAll } from './satellites';
import { computePerSatelliteRisk, getTopRiskSatellites } from './satRisk';
import {
    securityHeaders,
    apiRateLimit,
    requireApiKey,
    requireInternalSecret,
    errorHandler,
    requestLogger,
} from './middleware';
import { validateEnv } from './env';
import type { SatPosition, SatRiskSummary, RiskLevel } from '@sentinel/shared';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

const env = validateEnv();

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*' },
});

const PORT = env.GATEWAY_PORT;

app.use(securityHeaders);
app.use(requestLogger);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/api/', apiRateLimit);
app.use('/api/', requireApiKey(env));
app.use('/internal/', requireInternalSecret(env));

// ---------------------------------------------------------------------------
// Broadcast helper (injected into routes)
// ---------------------------------------------------------------------------

function broadcast(event: string, data: unknown): void {
    io.emit(event, data);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const router = createRouter({
    broadcast,
    getEnrichedPositions: () => getEnrichedPositions(),
    getTopRisk: () => getTopRisk(),
});
app.use(router);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Per-satellite risk enrichment cache
// ---------------------------------------------------------------------------

let latestEnrichedPositions: SatPosition[] = [];
let latestTopRisk: SatRiskSummary[] = [];
const prevSatLevels = new Map<number, RiskLevel>();

function enrichAndBroadcast(): SatPosition[] {
    const positions = propagateAll();
    const state = getLatestState();

    const enriched = computePerSatelliteRisk(
        positions,
        state.spaceWeather,
        state.neos,
    );

    latestEnrichedPositions = enriched;
    latestTopRisk = getTopRiskSatellites(enriched, 20);

    // Detect per-satellite risk escalations
    const satAlerts: Array<{
        noradId: number;
        name: string;
        orbitRegime: string;
        riskScore: number;
        riskLevel: RiskLevel;
        prevLevel: RiskLevel;
        threats: string[];
        timestamp: string;
    }> = [];

    const levelOrder: Record<RiskLevel, number> = {
        LOW: 0,
        MODERATE: 1,
        HIGH: 2,
        CRITICAL: 3,
    };

    for (const sat of enriched) {
        const prev = prevSatLevels.get(sat.id);
        const curr = sat.riskLevel;
        if (
            prev &&
            curr &&
            levelOrder[curr] > levelOrder[prev] &&
            levelOrder[curr] >= 2
        ) {
            satAlerts.push({
                noradId: sat.id,
                name: sat.name,
                orbitRegime: sat.orbitRegime!,
                riskScore: sat.riskScore!,
                riskLevel: curr,
                prevLevel: prev,
                threats: sat.threats ?? [],
                timestamp: new Date().toISOString(),
            });
        }
        if (curr) prevSatLevels.set(sat.id, curr);
    }

    if (satAlerts.length > 0) {
        io.emit('satellite-risk-alerts', satAlerts);

        // Persist to database (fire-and-forget, capped to avoid DB flood)
        for (const alert of satAlerts.slice(0, 20)) {
            prisma.satelliteRiskAlert
                .create({
                    data: {
                        noradId: alert.noradId,
                        name: alert.name,
                        regime: alert.orbitRegime,
                        riskScore: alert.riskScore,
                        riskLevel: alert.riskLevel,
                        prevLevel: alert.prevLevel,
                        threats: alert.threats,
                    },
                })
                .catch((err: unknown) => {
                    const msg =
                        err instanceof Error ? err.message : String(err);
                    console.error(`[SatRisk] Failed to persist alert: ${msg}`);
                });
        }
    }

    return enriched;
}

export function getEnrichedPositions(): SatPosition[] {
    return latestEnrichedPositions;
}

export function getTopRisk(): SatRiskSummary[] {
    return latestTopRisk;
}

// ---------------------------------------------------------------------------
// Socket.io connection handling
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    if (latestEnrichedPositions.length > 0) {
        socket.emit('satellite-positions', latestEnrichedPositions);
    } else {
        socket.emit('satellite-positions', propagateAll());
    }

    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

// ---------------------------------------------------------------------------
// Satellite position broadcast loop (every 10s)
// ---------------------------------------------------------------------------

setInterval(() => {
    const enriched = enrichAndBroadcast();
    io.emit('satellite-positions', enriched);
}, 10_000);

// ---------------------------------------------------------------------------
// Startup sequence
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL');

    await hydrateFromDb();

    // Await initial TLE load so the cache is populated before serving requests
    await refreshTles();
    enrichAndBroadcast();

    // Start the periodic TLE refresh (every 2h) and the position broadcast loop
    startTleRefreshLoop();

    httpServer.listen(PORT, () => {
        console.log(`[Gateway] Running on port ${PORT}`);
    });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
    console.log(`[Gateway] ${signal} received — shutting down`);
    io.close();
    httpServer.close();
    await disconnectDb();
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

start().catch((err) => {
    console.error('[Gateway] Fatal startup error:', err);
    process.exit(1);
});
