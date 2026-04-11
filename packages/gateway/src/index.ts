import dotenv from 'dotenv';
import path from 'path';

// Load root .env (CWD is packages/gateway when run via `npm run dev`)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { createServer } from 'http';

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import prisma, { disconnectDb } from './db';
import { hydrateFromDb, getLatestState, getFlarePathPredictions } from './agentState';
import { createRouter } from './routes';
import { refreshTles, startTleRefreshLoop, propagateAll, propagateAllWithEci } from './satellites';
import { computePerSatelliteRisk, getTopRiskSatellites } from './satRisk';
import { detectConjunctions, setLatestConjunctions, getLatestConjunctions } from './conjunction';
import {
    securityHeaders,
    apiRateLimit,
    requireApiKey,
    requireInternalSecret,
    createErrorHandler,
    createRequestLogger,
} from './middleware';
import { logger } from './logger';
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
const socketLog = logger.child({ component: 'Socket' });
const satRiskLog = logger.child({ component: 'SatRisk' });

// Dedup map for conjunction DB writes — key: "minId:maxId", value: last persisted ms
// Prevents flooding the DB with the same pair every 10s
const conjDbDedup = new Map<string, number>();
const CONJ_DB_DEDUP_MS = 60 * 60 * 1000; // 1 hour

app.use(securityHeaders);
app.use(createRequestLogger(logger));
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
app.use(createErrorHandler(logger));

// ---------------------------------------------------------------------------
// Per-satellite risk enrichment cache
// ---------------------------------------------------------------------------

let latestEnrichedPositions: SatPosition[] = [];
let latestTopRisk: SatRiskSummary[] = [];
const prevSatLevels = new Map<number, RiskLevel>();

function enrichAndBroadcast(): SatPosition[] {
    const eciPositions = propagateAllWithEci();
    const state = getLatestState();

    // Detect conjunctions using ECI vectors
    const conjResult = detectConjunctions(eciPositions);
    setLatestConjunctions(conjResult.all);

    // Strip ECI vectors for risk scoring
    const positions = eciPositions.map(({ eciX, eciY, eciZ, group, ...pos }) => pos);

    const predictions = getFlarePathPredictions();
    const enriched = computePerSatelliteRisk(
        positions,
        state.spaceWeather,
        state.neos,
        conjResult.all,
        predictions,
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
                    satRiskLog.error({ err: msg, noradId: alert.noradId }, 'Failed to persist satellite risk alert');
                });
        }
    }

    // Broadcast conjunction data
    if (conjResult.all.length > 0) {
        io.emit('conjunction-update', conjResult.all);
    }
    if (conjResult.newAlerts.length > 0) {
        io.emit('conjunction-alerts', conjResult.newAlerts);
    }

    // Persist all WARNING/CRITICAL conjunctions to DB — deduped per pair per hour
    // so intra-constellation GEO/LEO events are also recorded (not just inter-constellation)
    const now = Date.now();
    const notable = conjResult.all.filter(
        (c) => c.severity === 'WARNING' || c.severity === 'CRITICAL',
    );
    let dbWriteCount = 0;
    for (const conj of notable) {
        if (dbWriteCount >= 10) break; // cap per cycle
        const key =
            conj.sat1Id < conj.sat2Id
                ? `${conj.sat1Id}:${conj.sat2Id}`
                : `${conj.sat2Id}:${conj.sat1Id}`;
        const last = conjDbDedup.get(key);
        if (last && now - last < CONJ_DB_DEDUP_MS) continue;
        conjDbDedup.set(key, now);
        dbWriteCount++;
        prisma.conjunctionEvent
            .create({
                data: {
                    sat1NoradId: conj.sat1Id,
                    sat1Name: conj.sat1Name,
                    sat2NoradId: conj.sat2Id,
                    sat2Name: conj.sat2Name,
                    distanceKm: conj.distanceKm,
                    severity: conj.severity,
                    isIntraConstellation: conj.isIntraConstellation,
                    sat1Regime: conj.sat1Regime,
                    sat2Regime: conj.sat2Regime,
                    sat1Position: conj.sat1Position,
                    sat2Position: conj.sat2Position,
                },
            })
                .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    satRiskLog.error({ err: msg }, 'Failed to persist conjunction event');
                });
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
    socketLog.info({ socketId: socket.id }, 'Client connected');

    if (latestEnrichedPositions.length > 0) {
        socket.emit('satellite-positions', latestEnrichedPositions);
    } else {
        socket.emit('satellite-positions', propagateAll());
    }

    // Send current EONET events to newly connected clients
    const state = getLatestState();
    if (state.eonetEvents.length > 0) {
        socket.emit('eonet-events', state.eonetEvents);
    }

    // Send current conjunctions to newly connected clients
    const conjs = getLatestConjunctions();
    if (conjs.length > 0) {
        socket.emit('conjunction-update', conjs);
    }

    // Send current flare path predictions to newly connected clients
    const preds = getFlarePathPredictions();
    if (preds.length > 0) {
        socket.emit('flare-path-predictions', preds);
    }

    socket.on('disconnect', () => {
        socketLog.info({ socketId: socket.id }, 'Client disconnected');
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
    logger.info({ component: 'DB' }, 'Connected to PostgreSQL');

    await hydrateFromDb();

    // Await initial TLE load so the cache is populated before serving requests
    await refreshTles();
    enrichAndBroadcast();

    // Start the periodic TLE refresh (every 2h) and the position broadcast loop
    startTleRefreshLoop();

    httpServer.listen(PORT, () => {
        logger.info({ port: PORT }, 'Gateway server started');
    });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');
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
    logger.fatal({ err }, 'Fatal startup error');
    process.exit(1);
});
