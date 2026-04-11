import { Router, type Request, type Response } from 'express';
import axios from 'axios';

import {
    getLatestBrief,
    getLatestSpaceWeather,
    getLatestState,
    getAlertHistory,
    processAgentPush,
} from './agentState';
import {
    propagateAll,
    getSatelliteById,
    getSatelliteCount,
} from './satellites';
import type { AgentPushPayload } from '@sentinel/shared';

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3002';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

export function createRouter(
    broadcast: (event: string, data: unknown) => void
): Router {
    const router = Router();

    // -----------------------------------------------------------------------
    // GET /api/status
    // -----------------------------------------------------------------------
    router.get('/api/status', (_req: Request, res: Response) => {
        const state = getLatestState();
        res.json({
            risk: state.risk,
            brief: state.brief,
            spaceWeather: state.spaceWeather,
            satelliteCount: getSatelliteCount(),
            lastAgentUpdate: state.lastUpdate,
        });
    });

    // -----------------------------------------------------------------------
    // GET /api/satellites
    // -----------------------------------------------------------------------
    router.get('/api/satellites', (_req: Request, res: Response) => {
        const positions = propagateAll();
        res.json({ count: positions.length, satellites: positions });
    });

    // -----------------------------------------------------------------------
    // GET /api/satellites/:noradId
    // -----------------------------------------------------------------------
    router.get('/api/satellites/:noradId', (req: Request, res: Response) => {
        const noradId = parseInt(req.params.noradId, 10);
        if (isNaN(noradId)) {
            res.status(400).json({ error: 'Invalid NORAD ID' });
            return;
        }

        const sat = getSatelliteById(noradId);
        if (!sat) {
            res.status(404).json({ error: `Satellite ${noradId} not found` });
            return;
        }

        res.json(sat);
    });

    // -----------------------------------------------------------------------
    // GET /api/alerts
    // -----------------------------------------------------------------------
    router.get('/api/alerts', async (_req: Request, res: Response) => {
        try {
            const alerts = await getAlertHistory();
            res.json(alerts);
        }
        catch (err) {
            console.error('[Routes] Failed to fetch alerts:', err);
            res.status(500).json({ error: 'Failed to retrieve alert history' });
        }
    });

    // -----------------------------------------------------------------------
    // GET /api/space-weather
    // -----------------------------------------------------------------------
    router.get('/api/space-weather', (_req: Request, res: Response) => {
        const weather = getLatestSpaceWeather();
        res.json(weather);
    });

    // -----------------------------------------------------------------------
    // GET /api/agent/brief
    // -----------------------------------------------------------------------
    router.get('/api/agent/brief', (_req: Request, res: Response) => {
        const brief = getLatestBrief();
        if (!brief) {
            res.status(404).json({ error: 'No brief available' });
            return;
        }
        res.json(brief);
    });

    // -----------------------------------------------------------------------
    // POST /api/agent/brief — proxy to agent
    // -----------------------------------------------------------------------
    router.post('/api/agent/brief', async (_req: Request, res: Response) => {
        try {
            const response = await axios.post(
                `${AGENT_URL}/brief/generate`,
                {},
                { timeout: 35_000 }
            );
            res.json(response.data);
        }
        catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { error?: string } }; message?: string };
            const message = axiosErr.response?.data?.error ?? axiosErr.message ?? 'Unknown error';
            res.status(502).json({
                error: `Agent brief generation failed: ${message}`,
            });
        }
    });

    // -----------------------------------------------------------------------
    // GET /api/agent/health — proxy to agent
    // -----------------------------------------------------------------------
    router.get('/api/agent/health', async (_req: Request, res: Response) => {
        try {
            const response = await axios.get(`${AGENT_URL}/health`, {
                timeout: 5_000,
            });
            res.json(response.data);
        }
        catch (err: unknown) {
            const axiosErr = err as { message?: string };
            const message = axiosErr.message ?? 'Unknown error';
            res.status(502).json({
                error: `Agent unreachable: ${message}`,
            });
        }
    });

    // -----------------------------------------------------------------------
    // POST /internal/agent-push
    // -----------------------------------------------------------------------
    router.post(
        '/internal/agent-push',
        async (req: Request, res: Response) => {
            const secret = req.headers['x-internal-secret'];
            if (!INTERNAL_SECRET || secret !== INTERNAL_SECRET) {
                res.status(403).json({ error: 'Forbidden' });
                return;
            }

            try {
                const payload = req.body as AgentPushPayload;
                const result = await processAgentPush(payload);

                broadcast('risk-update', {
                    score: payload.risk.score,
                    level: payload.risk.level,
                    breakdown: payload.risk.breakdown,
                    timestamp: payload.timestamp,
                });

                broadcast('space-weather', payload.spaceWeather);

                if (result.isAlert) {
                    broadcast('risk-alert', {
                        level: payload.risk.level,
                        score: payload.risk.score,
                        brief: payload.brief?.summary ?? null,
                        timestamp: payload.timestamp,
                    });
                }

                res.json(result);
            }
            catch (err) {
                console.error('[Routes] Agent push processing failed:', err);
                res.status(500).json({ error: 'Internal processing error' });
            }
        }
    );

    return router;
}
