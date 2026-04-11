import dotenv from 'dotenv';
import path from 'path';

// Load root .env (CWD is packages/agent when run via `npm run dev`)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import cron from 'node-cron';

import { logger } from './logger';
import { validateEnv } from './env';
import router from './router';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

validateEnv();
import { pollSWPC } from './pollers/swpc';
import { pollDONKI } from './pollers/donki';
import { pollCMEAnalysis } from './pollers/cmeAnalysis';
import { pollNeoWs } from './pollers/neows';
import { pollEONET } from './pollers/eonet';
import { evaluate } from './riskEngine';
import {
    shouldGenerateBrief,
    generateBrief,
    generateFallbackBrief,
} from './llmBrief';
import { pushToGateway } from './push';
import {
    getPreviousRisk,
    getLatestBrief,
    buildSpaceWeatherState,
    getRecentFlares,
    getRecentCMEs,
    getUpcomingNeos,
    getActiveEonetEvents,
    getEarthDirectedCMEAnalyses,
    getFlarePathPredictions,
    saveFlarePathPredictions,
    saveMissionBrief,
} from './dataCache';
import { generateFlarePathPredictions } from './flarePathPredictor';
import { checkAndAlert } from './phoneAlert';
import { injectDemoData } from './demoData';

import type { AgentPushPayload } from '@sentinel/shared';

const cycleLog = logger.child({ component: 'Cycle' });
const initLog = logger.child({ component: 'Init' });
const cronLog = logger.child({ component: 'Cron' });

const DEMO_MODE = process.env.DEMO_MODE === 'true';

const app = express();
const PORT = process.env.AGENT_PORT || 3002;

app.use(express.json());

const httpLog = logger.child({ component: 'HTTP' });
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = { method: req.method, path: req.path, statusCode: res.statusCode, duration };
        if (res.statusCode >= 500) httpLog.error(logData, 'Request failed');
        else if (res.statusCode >= 400) httpLog.warn(logData, 'Client error');
        else httpLog.info(logData, 'Request completed');
    });
    next();
});

app.use(router);

// ---------------------------------------------------------------------------
// Risk evaluation cycle
// ---------------------------------------------------------------------------

async function runEvaluationCycle(): Promise<void> {
    try {
        cycleLog.info('Starting risk evaluation cycle');

        // 0. Inject demo data if enabled (overrides real SWPC readings)
        if (DEMO_MODE) {
            await injectDemoData();
        }

        // 1. Evaluate risk (includes CME path scoring)
        const risk = await evaluate();

        // 1b. Generate flare path predictions from CME analysis data
        const earthDirectedCMEs = await getEarthDirectedCMEAnalyses();
        const currentWeather = await buildSpaceWeatherState();
        const predictions = await generateFlarePathPredictions(earthDirectedCMEs, currentWeather);
        await saveFlarePathPredictions(predictions);

        // 2. Check if we should generate a new LLM brief
        const previousRisk = await getPreviousRisk();
        const latestBrief = await getLatestBrief();
        const lastBriefAt = latestBrief
            ? new Date(latestBrief.generatedAt)
            : null;

        let brief = latestBrief;
        if (shouldGenerateBrief(risk, previousRisk, lastBriefAt)) {
            const weather = await buildSpaceWeatherState();
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            );
            const [flares, cmes, neos] = await Promise.all([
                getRecentFlares(thirtyDaysAgo),
                getRecentCMEs(thirtyDaysAgo),
                getUpcomingNeos(7),
            ]);
            brief = await generateBrief(risk, weather, flares, cmes, neos);
        } else if (!brief) {
            // Generate fallback if no brief exists at all
            brief = generateFallbackBrief(risk);
            await saveMissionBrief(brief);
        }

        // 3. Check phone alerts
        await checkAndAlert(risk, previousRisk, brief);

        // 4. Build push payload
        const weather = await buildSpaceWeatherState();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [flares, cmes, neos, eonetEvents] = await Promise.all([
            getRecentFlares(thirtyDaysAgo),
            getRecentCMEs(thirtyDaysAgo),
            getUpcomingNeos(7),
            getActiveEonetEvents(),
        ]);

        const payload: AgentPushPayload = {
            risk,
            brief,
            spaceWeather: weather,
            flares,
            cmes,
            neos,
            eonetEvents,
            flarePathPredictions: await getFlarePathPredictions(),
            timestamp: new Date().toISOString(),
        };

        // 5. Push to gateway
        await pushToGateway(payload);

        cycleLog.info({ score: risk.score, level: risk.level }, 'Evaluation cycle complete');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        cycleLog.error({ err: msg }, 'Evaluation cycle failed');
    }
}

// ---------------------------------------------------------------------------
// Initial data fetch + first evaluation
// ---------------------------------------------------------------------------

async function initialFetch(): Promise<void> {
    initLog.info('Running initial data fetch');

    const results = await Promise.allSettled([
        pollSWPC(),
        pollDONKI(),
        pollCMEAnalysis(),
        pollNeoWs(),
        pollEONET(),
    ]);

    const labels = ['SWPC', 'DONKI', 'CMEAnalysis', 'NeoWs', 'EONET'];
    for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
            const reason = (results[i] as PromiseRejectedResult).reason;
            initLog.error({ source: labels[i], err: reason }, 'Initial fetch failed');
        }
    }

    initLog.info('Initial fetch complete, running first evaluation');
    if (DEMO_MODE) {
        initLog.info('Demo mode enabled, overlaying fake high-risk data');
    }
    await runEvaluationCycle();
}

// ---------------------------------------------------------------------------
// Cron scheduling
// ---------------------------------------------------------------------------

const cronJobs: cron.ScheduledTask[] = [];

function scheduleCronJobs(): void {
    // SWPC: every 5 minutes
    cronJobs.push(
        cron.schedule('*/5 * * * *', async () => {
            await pollSWPC();
        }),
    );

    // DONKI: every 15 minutes
    cronJobs.push(
        cron.schedule('*/15 * * * *', async () => {
            await pollDONKI();
        }),
    );

    // CME Analysis: every 15 minutes (aligned with DONKI cadence)
    cronJobs.push(
        cron.schedule('*/15 * * * *', async () => {
            await pollCMEAnalysis();
        }),
    );

    // EONET: every hour
    cronJobs.push(
        cron.schedule('0 * * * *', async () => {
            await pollEONET();
        }),
    );

    // NeoWs: daily at midnight
    cronJobs.push(
        cron.schedule('0 0 * * *', async () => {
            await pollNeoWs();
        }),
    );

    // Risk evaluation: every 5 minutes, offset 1 min after SWPC
    cronJobs.push(
        cron.schedule('1-59/5 * * * *', async () => {
            await runEvaluationCycle();
        }),
    );

    cronLog.info('All cron jobs scheduled');
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
    logger.info({ signal }, 'Shutdown signal received');

    for (const job of cronJobs) {
        job.stop();
    }

    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
    app.listen(PORT, () => {
        logger.info({ port: PORT }, 'Agent service started');
        scheduleCronJobs();
        // Fire-and-forget initial fetch — don't block server startup
        initialFetch().catch((err) => initLog.fatal({ err }, 'Initial fetch failed'));
    });
}

main();
