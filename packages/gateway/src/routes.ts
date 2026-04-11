import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { z } from 'zod';

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
import { computeDetailedBreakdown } from './satRisk';
import type {
    AgentPushPayload,
    SatPosition,
    SatRiskSummary,
} from '@sentinel/shared';

const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3002';

// ---------------------------------------------------------------------------
// Zod schema for agent push payload validation
// ---------------------------------------------------------------------------

const riskBreakdownSchema = z.object({
    flare: z.number(),
    geomagnetic: z.number(),
    radiation: z.number(),
    solarWind: z.number(),
    imfBz: z.number(),
    neo: z.number(),
    compound: z.number(),
});

const riskStateSchema = z.object({
    score: z.number().min(0).max(100),
    level: z.enum(['LOW', 'MODERATE', 'HIGH', 'CRITICAL']),
    breakdown: riskBreakdownSchema,
    timestamp: z.string(),
});

const spaceWeatherSchema = z.object({
    xrayClass: z.string().nullable(),
    kpIndex: z.number().nullable(),
    protonFlux: z.number().nullable(),
    solarWindSpeed: z.number().nullable(),
    bz: z.number().nullable(),
    timestamp: z.string(),
});

const agentPushSchema = z.object({
    risk: riskStateSchema,
    brief: z
        .object({
            recommendation: z.enum(['GO', 'CAUTION', 'NO-GO']),
            summary: z.string(),
            threats: z.array(z.string()),
            maneuverWindows: z.array(z.string()),
            confidence: z.number().min(0).max(1),
            generatedAt: z.string(),
            isLlm: z.boolean(),
        })
        .nullable(),
    spaceWeather: spaceWeatherSchema,
    flares: z.array(
        z.object({
            flrID: z.string(),
            classType: z.string(),
            beginTime: z.string(),
            peakTime: z.string(),
            endTime: z.string().nullable(),
            sourceLocation: z.string(),
        }),
    ),
    cmes: z.array(
        z.object({
            activityID: z.string(),
            startTime: z.string(),
            speed: z.number().nullable(),
            type: z.string(),
        }),
    ),
    neos: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            estimatedDiameter: z.number(),
            isPotentiallyHazardous: z.boolean(),
            closeApproachDate: z.string(),
            missDistanceKm: z.number(),
            relativeVelocityKmS: z.number(),
        }),
    ),
    timestamp: z.string(),
});

export interface RouterDeps {
    broadcast: (event: string, data: unknown) => void;
    getEnrichedPositions: () => SatPosition[];
    getTopRisk: () => SatRiskSummary[];
}

export function createRouter(
    broadcastOrDeps: ((event: string, data: unknown) => void) | RouterDeps,
): Router {
    const deps: RouterDeps =
        typeof broadcastOrDeps === 'function'
            ? {
                  broadcast: broadcastOrDeps,
                  getEnrichedPositions: () => propagateAll(),
                  getTopRisk: () => [],
              }
            : broadcastOrDeps;
    const { broadcast, getEnrichedPositions, getTopRisk } = deps;
    const router = Router();

    // -----------------------------------------------------------------------
    // GET /health — gateway health check
    // -----------------------------------------------------------------------
    router.get('/health', (_req: Request, res: Response) => {
        const state = getLatestState();
        res.json({
            status: 'ok',
            service: 'gateway',
            satelliteCount: getSatelliteCount(),
            hasAgentData: state.lastUpdate !== null,
            lastAgentUpdate: state.lastUpdate,
            timestamp: new Date().toISOString(),
        });
    });

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
    router.get('/api/satellites', (req: Request, res: Response) => {
        const enriched = getEnrichedPositions();
        const total = enriched.length;
        const perPage = 150;

        const pageParam = parseInt(req.query.page as string, 10);
        const page = !isNaN(pageParam) && pageParam >= 1 ? pageParam : 1;
        const totalPages = Math.ceil(total / perPage);
        const offset = (page - 1) * perPage;
        const slice = enriched.slice(offset, offset + perPage);

        res.json({
            total,
            page,
            perPage,
            totalPages,
            count: slice.length,
            satellites: slice,
        });
    });

    // -----------------------------------------------------------------------
    // GET /api/satellites/top-risk
    // -----------------------------------------------------------------------
    router.get('/api/satellites/top-risk', (req: Request, res: Response) => {
        const count = Math.min(parseInt(req.query.count as string) || 20, 100);
        const topRisk = getTopRisk().slice(0, count);
        res.json({ count: topRisk.length, satellites: topRisk });
    });

    // -----------------------------------------------------------------------
    // GET /api/satellites/risk-stats
    // -----------------------------------------------------------------------
    router.get('/api/satellites/risk-stats', (_req: Request, res: Response) => {
        const enriched = getEnrichedPositions();
        const stats = {
            total: enriched.length,
            byLevel: {
                CRITICAL: enriched.filter((s) => s.riskLevel === 'CRITICAL')
                    .length,
                HIGH: enriched.filter((s) => s.riskLevel === 'HIGH').length,
                MODERATE: enriched.filter((s) => s.riskLevel === 'MODERATE')
                    .length,
                LOW: enriched.filter((s) => s.riskLevel === 'LOW').length,
            },
            byRegime: {
                LEO: enriched.filter((s) => s.orbitRegime === 'LEO').length,
                MEO: enriched.filter((s) => s.orbitRegime === 'MEO').length,
                GEO: enriched.filter((s) => s.orbitRegime === 'GEO').length,
                HEO: enriched.filter((s) => s.orbitRegime === 'HEO').length,
            },
            topRisk: getTopRisk().slice(0, 5),
            timestamp: new Date().toISOString(),
        };
        res.json(stats);
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
    // GET /api/satellites/:noradId/risk
    // -----------------------------------------------------------------------
    router.get(
        '/api/satellites/:noradId/risk',
        (req: Request, res: Response) => {
            const noradId = parseInt(req.params.noradId, 10);
            if (isNaN(noradId)) {
                res.status(400).json({ error: 'Invalid NORAD ID' });
                return;
            }

            const sat = getSatelliteById(noradId);
            if (!sat) {
                res.status(404).json({
                    error: `Satellite ${noradId} not found`,
                });
                return;
            }

            const state = getLatestState();
            const breakdown = computeDetailedBreakdown(
                sat,
                state.spaceWeather,
                state.neos,
            );
            res.json(breakdown);
        },
    );

    // -----------------------------------------------------------------------
    // GET /api/alerts
    // -----------------------------------------------------------------------
    router.get('/api/alerts', async (_req: Request, res: Response) => {
        try {
            const alerts = await getAlertHistory();
            res.json(alerts);
        } catch (err) {
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
                { timeout: 35_000 },
            );
            res.json(response.data);
        } catch (err: unknown) {
            const axiosErr = err as {
                response?: { data?: { error?: string } };
                message?: string;
            };
            const message =
                axiosErr.response?.data?.error ??
                axiosErr.message ??
                'Unknown error';
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
        } catch (err: unknown) {
            const axiosErr = err as { message?: string };
            const message = axiosErr.message ?? 'Unknown error';
            res.status(502).json({
                error: `Agent unreachable: ${message}`,
            });
        }
    });

    // -----------------------------------------------------------------------
    // GET /api/agent/call-history — proxy to agent
    // -----------------------------------------------------------------------
    router.get(
        '/api/agent/call-history',
        async (_req: Request, res: Response) => {
            try {
                const response = await axios.get(
                    `${AGENT_URL}/alerts/call-history`,
                    {
                        timeout: 5_000,
                    },
                );
                res.json(response.data);
            } catch (err: unknown) {
                const axiosErr = err as { message?: string };
                const message = axiosErr.message ?? 'Unknown error';
                res.status(502).json({
                    error: `Agent unreachable: ${message}`,
                });
            }
        },
    );

    // -----------------------------------------------------------------------
    // POST /api/agent/test-call — proxy to agent
    // -----------------------------------------------------------------------
    router.post(
        '/api/agent/test-call',
        async (_req: Request, res: Response) => {
            try {
                const response = await axios.post(
                    `${AGENT_URL}/alerts/test-call`,
                    {},
                    { timeout: 20_000 },
                );
                res.json(response.data);
            } catch (err: unknown) {
                const axiosErr = err as {
                    response?: { data?: { error?: string } };
                    message?: string;
                };
                const message =
                    axiosErr.response?.data?.error ??
                    axiosErr.message ??
                    'Unknown error';
                res.status(502).json({
                    error: `Agent test call failed: ${message}`,
                });
            }
        },
    );

    // -----------------------------------------------------------------------
    // GET /internal/top-risk-satellites — used by agent for LLM briefs
    // -----------------------------------------------------------------------
    router.get(
        '/internal/top-risk-satellites',
        (_req: Request, res: Response) => {
            res.json({ satellites: getTopRisk() });
        },
    );

    // -----------------------------------------------------------------------
    // POST /internal/agent-push
    // -----------------------------------------------------------------------
    router.post('/internal/agent-push', async (req: Request, res: Response) => {
        try {
            const parsed = agentPushSchema.safeParse(req.body);
            if (!parsed.success) {
                const errors = parsed.error.issues
                    .map((i) => `${i.path.join('.')}: ${i.message}`)
                    .join('; ');
                res.status(400).json({ error: `Invalid payload: ${errors}` });
                return;
            }
            const payload = parsed.data as AgentPushPayload;
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
        } catch (err) {
            console.error('[Routes] Agent push processing failed:', err);
            res.status(500).json({ error: 'Internal processing error' });
        }
    });

    return router;
}
