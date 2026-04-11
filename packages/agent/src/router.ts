import { Router } from 'express';
import axios from 'axios';
import { z } from 'zod';

import { logger } from './logger';
import { generateOrbitSuggestion, type OrbitSuggestionInput } from './orbitSuggestion';
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
    getActiveFlarePathPredictions,
} from './dataCache';
import { evaluate } from './riskEngine';
import { generateBrief, generateFallbackBrief } from './llmBrief';
import { generateNarrationScript, generateFallbackNarrationScript, streamNarrationTokens } from './narrationBrief';
import {
    getCallHistory,
    loadAlertConfig,
    getCallState,
    updateCallState,
    addCallHistoryEntry,
} from './alertConfig';
import { initiateOutboundCall } from './elevenLabsClient';
import type { NarrationRequest, SatRiskSummary, ConjunctionEvent } from '@sentinel/shared';

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
        const predictions = await getActiveFlarePathPredictions();

        let brief;
        if (process.env.ANTHROPIC_API_KEY) {
            brief = await generateBrief(risk, weather, flares, cmes, neos, predictions);
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

// ---------------------------------------------------------------------------
// POST /alerts/force-call — trigger a voice call regardless of env/cooldown
// ---------------------------------------------------------------------------

router.post('/alerts/force-call', async (_req, res) => {
    try {
        log.info('Force call triggered');

        const risk = await getLatestRisk();
        if (!risk) {
            res.status(404).json({ error: 'No risk state available yet' });
            return;
        }

        const brief = await getLatestBrief();
        const useBrief = brief ?? generateFallbackBrief(risk);

        // Bypass shouldCall entirely — dial every configured operator phone directly
        const config = loadAlertConfig();
        const phones = config.operatorPhones;

        if (phones.length === 0) {
            res.status(400).json({ error: 'No operator phones configured (ALERT_PHONE_NUMBERS)' });
            return;
        }

        const callState = getCallState();
        let successCount = 0;

        for (const phone of phones) {
            const result = await initiateOutboundCall({
                riskState: risk,
                brief: useBrief,
                toNumber: phone,
            });

            addCallHistoryEntry({
                timestamp: new Date().toISOString(),
                riskLevel: risk.level,
                score: risk.score,
                conversationId: result?.conversationId ?? null,
                callSid: result?.callSid ?? null,
                toNumber: phone,
                reason: 'manual force',
                success: result !== null,
            });

            if (result) {
                successCount++;
                updateCallState({
                    lastCallTime: Date.now(),
                    lastCallLevel: risk.level,
                    callsThisHour: callState.callsThisHour + 1,
                    activeConversationId: result.conversationId,
                });
            }
        }

        log.info({ phones: phones.length, successCount, riskLevel: risk.level, score: risk.score }, 'Force call complete');

        res.json({
            message: 'Force call triggered',
            riskLevel: risk.level,
            score: risk.score,
            phones: phones.length,
            successCount,
        });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: `Force call failed: ${msg}` });
    }
});

// ---------------------------------------------------------------------------
// POST /narrate — generate spoken narration script for a clicked globe object
// ---------------------------------------------------------------------------

const narrationRequestSchema = z.object({
    objectType: z.enum(['satellite', 'threat', 'neo']),
    objectId: z.string().min(1),
    objectName: z.string().min(1),
});

router.post('/narrate', async (req, res) => {
    const parsed = narrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid narration request' });
        return;
    }
    const narReq: NarrationRequest = parsed.data;

    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [risk, flares, cmes, neos] = await Promise.all([
            getLatestRisk(),
            getRecentFlares(thirtyDaysAgo),
            getRecentCMEs(thirtyDaysAgo),
            getUpcomingNeos(7),
        ]);
        const weather = await buildSpaceWeatherState();

        // Fetch gateway context best-effort (top-risk satellites + conjunctions)
        const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
        const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
        let topRisk: SatRiskSummary[] = [];
        let conjunctions: ConjunctionEvent[] = [];

        try {
            const [trRes, cjRes] = await Promise.all([
                axios.get(`${GATEWAY_URL}/internal/top-risk-satellites`, {
                    headers: { 'x-internal-secret': INTERNAL_SECRET },
                    timeout: 3000,
                }),
                axios.get(`${GATEWAY_URL}/internal/active-conjunctions`, {
                    headers: { 'x-internal-secret': INTERNAL_SECRET },
                    timeout: 3000,
                }),
            ]);
            topRisk = (trRes.data.satellites ?? []) as SatRiskSummary[];
            conjunctions = (cjRes.data.conjunctions ?? []) as ConjunctionEvent[];
        } catch {
            // Gateway context is best-effort — proceed without it
        }

        const script = await generateNarrationScript(
            narReq, risk, weather, flares, cmes, neos, topRisk, conjunctions,
        );

        log.info({ objectType: narReq.objectType, objectId: narReq.objectId }, 'Narration script generated');
        res.json(script);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ err: msg }, 'Narration script generation failed, returning fallback');
        const fallback = generateFallbackNarrationScript(narReq, null);
        res.json(fallback);
    }
});

// ---------------------------------------------------------------------------
// POST /narrate/stream — SSE stream of narration tokens as Claude generates them
// ---------------------------------------------------------------------------

router.post('/narrate/stream', async (req, res) => {
    const parsed = narrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid narration request' });
        return;
    }
    const narReq: NarrationRequest = parsed.data;

    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [risk, flares, cmes, neos] = await Promise.all([
            getLatestRisk(),
            getRecentFlares(thirtyDaysAgo),
            getRecentCMEs(thirtyDaysAgo),
            getUpcomingNeos(7),
        ]);
        const weather = await buildSpaceWeatherState();

        const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
        const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
        let topRisk: SatRiskSummary[] = [];
        let conjunctions: ConjunctionEvent[] = [];
        try {
            const [trRes, cjRes] = await Promise.all([
                axios.get(`${GATEWAY_URL}/internal/top-risk-satellites`, {
                    headers: { 'x-internal-secret': INTERNAL_SECRET },
                    timeout: 3000,
                }),
                axios.get(`${GATEWAY_URL}/internal/active-conjunctions`, {
                    headers: { 'x-internal-secret': INTERNAL_SECRET },
                    timeout: 3000,
                }),
            ]);
            topRisk = (trRes.data.satellites ?? []) as SatRiskSummary[];
            conjunctions = (cjRes.data.conjunctions ?? []) as ConjunctionEvent[];
        } catch { /* best-effort */ }

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();

        let fullScript = '';
        for await (const token of streamNarrationTokens(
            narReq, risk, weather, flares, cmes, neos, topRisk, conjunctions,
        )) {
            fullScript += token;
            res.write(`data: ${JSON.stringify({ token })}\n\n`);
        }

        res.write(`data: ${JSON.stringify({ done: true, fullScript })}\n\n`);
        res.end();

        log.info({ objectType: narReq.objectType, objectId: narReq.objectId, len: fullScript.length }, 'Narration streamed via SSE');
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ err: msg }, 'Narration SSE stream failed');
        if (!res.headersSent) {
            res.status(500).json({ error: 'Stream failed' });
        } else {
            res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
            res.end();
        }
    }
});

// ---------------------------------------------------------------------------
// POST /orbit-suggestion
// ---------------------------------------------------------------------------

router.post('/orbit-suggestion', async (req, res) => {
    try {
        const input = req.body as OrbitSuggestionInput;
        if (!input?.satellite || !input?.threat || !input?.currentOrbit) {
            res.status(400).json({ error: 'Missing required fields: satellite, threat, currentOrbit' });
            return;
        }
        const suggestion = await generateOrbitSuggestion(input);
        res.json({ suggestion, newOrbit: suggestion.newOrbit });
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        res.status(500).json({ error: `Orbit suggestion failed: ${msg}` });
    }
});

export default router;
