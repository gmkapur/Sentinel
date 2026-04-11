import { Router } from 'express';

import { logger } from './logger';
import {
    getLatestRisk,
    getLatestBrief,
    getLatestSpaceWeather,
    getPollStatuses,
    buildSpaceWeatherState,
    getRecentFlares,
    getRecentCMEs,
    getUpcomingNeos,
    getActiveEonetEvents,
} from './dataCache';
import { evaluate } from './riskEngine';
import { generateBrief, generateFallbackBrief } from './llmBrief';
import { checkAndAlert } from './phoneAlert';
import { getCallHistory } from './alertConfig';

const log = logger.child({ component: 'Router' });

const router = Router();

// ---------------------------------------------------------------------------
// GET /health — agent health check
// ---------------------------------------------------------------------------
router.get('/health', async (_req, res) => {
    const statuses = await getPollStatuses();
    const risk = await getLatestRisk();
    res.json({
        status: 'ok',
        service: 'agent',
        hasRiskData: risk !== null,
        pollerCount: statuses.length,
        pollersHealthy: statuses.filter((s) => s.lastSuccess).length,
        timestamp: new Date().toISOString(),
    });
});

const VALID_SOURCES = [
    'swpc-xray',
    'swpc-kp',
    'swpc-protons',
    'swpc-wind',
    'swpc-mag',
    'donki-flares',
    'donki-cme',
    'neows',
    'eonet',
] as const;

const startTime = Date.now();

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

router.get('/health', async (_req, res) => {
    try {
        const pollStatuses = await getPollStatuses();
        const lastPolls: Record<string, number> = {};
        for (const ps of pollStatuses) {
            lastPolls[ps.source] = ps.lastPollAt.getTime();
        }

        res.json({
            status: 'ok',
            uptime: (Date.now() - startTime) / 1000,
            lastPolls,
        });
    } catch (_error) {
        res.status(500).json({ error: 'Health check failed' });
    }
});

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------

router.get('/status', async (_req, res) => {
    try {
        const risk = await getLatestRisk();
        if (!risk) {
            res.json({
                score: 0,
                level: 'LOW',
                breakdown: null,
                timestamp: null,
            });
            return;
        }
        res.json(risk);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to retrieve risk status' });
    }
});

// ---------------------------------------------------------------------------
// GET /brief
// ---------------------------------------------------------------------------

router.get('/brief', async (_req, res) => {
    try {
        const brief = await getLatestBrief();
        if (!brief) {
            res.status(404).json({ error: 'No brief generated yet' });
            return;
        }
        res.json(brief);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to retrieve brief' });
    }
});

// ---------------------------------------------------------------------------
// POST /brief/generate
// ---------------------------------------------------------------------------

router.post('/brief/generate', async (_req, res) => {
    try {
        log.info('Brief generation requested');

        const risk = await evaluate();
        const weather = await buildSpaceWeatherState();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [flares, cmes, neos] = await Promise.all([
            getRecentFlares(thirtyDaysAgo),
            getRecentCMEs(thirtyDaysAgo),
            getUpcomingNeos(7),
        ]);

        let brief;
        if (process.env.ANTHROPIC_API_KEY) {
            brief = await generateBrief(risk, weather, flares, cmes, neos);
        } else {
            brief = generateFallbackBrief(risk);
        }

        log.info({ recommendation: brief.recommendation }, 'Brief generated via API');
        res.json(brief);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: `Brief generation failed: ${msg}` });
    }
});

// ---------------------------------------------------------------------------
// GET /data/:source
// ---------------------------------------------------------------------------

router.get('/data/:source', async (req, res) => {
    const source = req.params.source;

    if (!VALID_SOURCES.includes(source as (typeof VALID_SOURCES)[number])) {
        res.status(400).json({
            error: `Unknown source. Valid: ${VALID_SOURCES.join(', ')}`,
        });
        return;
    }

    try {
        let data: unknown;

        if (source === 'donki-flares') {
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            );
            data = await getRecentFlares(thirtyDaysAgo);
        } else if (source === 'donki-cme') {
            const thirtyDaysAgo = new Date(
                Date.now() - 30 * 24 * 60 * 60 * 1000,
            );
            data = await getRecentCMEs(thirtyDaysAgo);
        } else if (source === 'neows') {
            data = await getUpcomingNeos(7);
        } else if (source === 'eonet') {
            data = await getActiveEonetEvents();
        } else {
            data = await getLatestSpaceWeather(source);
        }

        if (data === null || data === undefined) {
            res.status(404).json({
                error: 'No data cached for this source yet',
            });
            return;
        }

        res.json({ source, data });
    } catch (_error) {
        res.status(500).json({ error: 'Failed to retrieve data' });
    }
});

// ---------------------------------------------------------------------------
// GET /space-weather
// ---------------------------------------------------------------------------

router.get('/space-weather', async (_req, res) => {
    try {
        const state = await buildSpaceWeatherState();
        res.json(state);
    } catch (_error) {
        res.status(500).json({ error: 'Failed to build space weather state' });
    }
});

// ---------------------------------------------------------------------------
// GET /alerts/call-history
// ---------------------------------------------------------------------------

router.get('/alerts/call-history', (_req, res) => {
    res.json(getCallHistory());
});

// ---------------------------------------------------------------------------
// POST /alerts/test-call
// ---------------------------------------------------------------------------

router.post('/alerts/test-call', async (_req, res) => {
    if (process.env.NODE_ENV === 'production') {
        res.status(403).json({ error: 'Test calls disabled in production' });
        return;
    }

    try {
        log.info('Test call triggered');

        const risk = await getLatestRisk();
        if (!risk) {
            res.status(404).json({ error: 'No risk state available yet' });
            return;
        }

        const brief = await getLatestBrief();
        const useBrief = brief ?? generateFallbackBrief(risk);

        // Force-trigger alert regardless of level/cooldown
        await checkAndAlert(risk, null, useBrief);

        res.json({
            message: 'Test call triggered',
            riskLevel: risk.level,
            score: risk.score,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: `Test call failed: ${msg}` });
    }
});

export default router;
