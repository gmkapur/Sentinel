import dotenv from 'dotenv';
import path from 'path';

// Load root .env (CWD is packages/agent when run via `npm run dev`)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import express from 'express';
import cron from 'node-cron';

import { validateEnv } from './env';
import router from './router';

// ---------------------------------------------------------------------------
// Environment validation
// ---------------------------------------------------------------------------

validateEnv();
import { pollSWPC } from './pollers/swpc';
import { pollDONKI } from './pollers/donki';
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
    saveMissionBrief,
} from './dataCache';
import { checkAndAlert } from './phoneAlert';
import { injectDemoData } from './demoData';

import type { AgentPushPayload } from '@sentinel/shared';

const DEMO_MODE = process.env.DEMO_MODE === 'true';

const app = express();
const PORT = process.env.AGENT_PORT || 3002;

app.use(express.json());
app.use(router);

// ---------------------------------------------------------------------------
// Risk evaluation cycle
// ---------------------------------------------------------------------------

async function runEvaluationCycle(): Promise<void> {
    try {
        console.log('[Cycle] Starting risk evaluation cycle...');

        // 0. Inject demo data if enabled (overrides real SWPC readings)
        if (DEMO_MODE) {
            await injectDemoData();
        }

        // 1. Evaluate risk
        const risk = await evaluate();

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
        const [flares, cmes, neos] = await Promise.all([
            getRecentFlares(thirtyDaysAgo),
            getRecentCMEs(thirtyDaysAgo),
            getUpcomingNeos(7),
        ]);

        const payload: AgentPushPayload = {
            risk,
            brief,
            spaceWeather: weather,
            flares,
            cmes,
            neos,
            timestamp: new Date().toISOString(),
        };

        // 5. Push to gateway
        await pushToGateway(payload);

        console.log('[Cycle] Evaluation cycle complete');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[Cycle] Evaluation cycle failed: ${msg}`);
    }
}

// ---------------------------------------------------------------------------
// Initial data fetch + first evaluation
// ---------------------------------------------------------------------------

async function initialFetch(): Promise<void> {
    console.log('[Init] Running initial data fetch...');

    const results = await Promise.allSettled([
        pollSWPC(),
        pollDONKI(),
        pollNeoWs(),
        pollEONET(),
    ]);

    const labels = ['SWPC', 'DONKI', 'NeoWs', 'EONET'];
    for (let i = 0; i < results.length; i++) {
        if (results[i].status === 'rejected') {
            const reason = (results[i] as PromiseRejectedResult).reason;
            console.error(
                `[Init] ${labels[i]} initial fetch failed: ${reason}`,
            );
        }
    }

    console.log('[Init] Initial fetch complete, running first evaluation...');
    if (DEMO_MODE) {
        console.log(
            '[DEMO] Demo mode enabled — overlaying fake high-risk data',
        );
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

    console.log('[Cron] All jobs scheduled');
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
    console.log(`\n[Shutdown] Received ${signal}, shutting down gracefully...`);

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
        console.log(`[Agent] Service running on port ${PORT}`);
        scheduleCronJobs();
        // Fire-and-forget initial fetch — don't block server startup
        initialFetch().catch((err) => console.error('[Init] Failed:', err));
    });
}

main();
