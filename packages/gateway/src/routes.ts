import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { z } from 'zod';
import { logger } from './logger';
import prisma from './db';

import {
    getLatestBrief,
    getLatestSpaceWeather,
    getLatestEonetEvents,
    getFlarePathPredictions,
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
import { getLatestConjunctions } from './conjunction';
import type {
    AgentPushPayload,
    ConjunctionEvent,
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
    cmePath: z.number().default(0),
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
    eonetEvents: z.array(
        z.object({
            eventId: z.string(),
            title: z.string(),
            category: z.string(),
            source: z.string(),
            link: z.string().nullable(),
            date: z.string(),
            coordinates: z.object({
                type: z.string(),
                coordinates: z.array(z.number()),
            }).nullable(),
        }),
    ),
    flarePathPredictions: z.array(
        z.object({
            id: z.string(),
            associatedCMEID: z.string(),
            analysis: z.object({
                time21_5: z.string(),
                latitude: z.number(),
                longitude: z.number(),
                halfAngle: z.number(),
                speed: z.number(),
                type: z.string(),
                isMostAccurate: z.boolean(),
                associatedCMEID: z.string(),
                note: z.string(),
                catalog: z.string(),
            }),
            coneLatitude: z.number(),
            coneLongitude: z.number(),
            coneHalfAngle: z.number(),
            coneSpeedKmS: z.number(),
            estimatedArrivalTime: z.string(),
            estimatedTransitHours: z.number(),
            arrivalWindowStart: z.string(),
            arrivalWindowEnd: z.string(),
            earthDirectedness: z.enum(['DIRECT_HIT', 'GLANCING', 'MISS']),
            earthImpactProbability: z.number(),
            isEarthDirected: z.boolean(),
            affectedSatellites: z.array(z.object({
                noradId: z.number(),
                name: z.string(),
                orbitRegime: z.string(),
                impactProbability: z.number(),
                predictedPosition: z.object({
                    lat: z.number(),
                    lng: z.number(),
                    alt: z.number(),
                }),
                isSunlit: z.boolean(),
                isInSAA: z.boolean(),
                riskContribution: z.number(),
                advisory: z.string(),
            })),
            generatedAt: z.string(),
            confidence: z.number(),
        }),
    ).default([]),
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
    const routeLog = logger.child({ component: 'Routes' });
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
            const conjunctions = getLatestConjunctions();
            const predictions = getFlarePathPredictions();
            const breakdown = computeDetailedBreakdown(
                sat,
                state.spaceWeather,
                state.neos,
                conjunctions,
                predictions,
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
            routeLog.error({ err }, 'Failed to fetch alert history');
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
    // GET /api/events — active EONET events with coordinates
    // -----------------------------------------------------------------------
    router.get('/api/events', (_req: Request, res: Response) => {
        const events = getLatestEonetEvents();
        res.json({ count: events.length, events });
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
    // GET /api/conjunctions — active conjunctions
    // -----------------------------------------------------------------------
    router.get('/api/conjunctions', (req: Request, res: Response) => {
        let conjunctions = getLatestConjunctions();
        const { severity, noradId, limit } = req.query;

        if (severity) {
            conjunctions = conjunctions.filter(
                (c) => c.severity === String(severity).toUpperCase(),
            );
        }
        if (noradId) {
            const id = parseInt(String(noradId), 10);
            if (!isNaN(id)) {
                conjunctions = conjunctions.filter(
                    (c) => c.sat1Id === id || c.sat2Id === id,
                );
            }
        }

        const maxResults = Math.min(parseInt(String(limit), 10) || 100, 500);
        const sorted = conjunctions.sort((a, b) => a.distanceKm - b.distanceKm);

        res.json({
            count: Math.min(sorted.length, maxResults),
            conjunctions: sorted.slice(0, maxResults),
        });
    });

    // -----------------------------------------------------------------------
    // GET /api/conjunctions/:noradId — conjunctions for a specific satellite
    // -----------------------------------------------------------------------
    router.get('/api/conjunctions/:noradId', (req: Request, res: Response) => {
        const noradId = parseInt(req.params.noradId, 10);
        if (isNaN(noradId)) {
            res.status(400).json({ error: 'Invalid NORAD ID' });
            return;
        }

        const conjunctions = getLatestConjunctions()
            .filter((c) => c.sat1Id === noradId || c.sat2Id === noradId)
            .sort((a, b) => a.distanceKm - b.distanceKm);

        res.json({ noradId, count: conjunctions.length, conjunctions });
    });

    // -----------------------------------------------------------------------
    // GET /api/conjunctions/history — historical events from DB
    // -----------------------------------------------------------------------
    router.get('/api/conjunctions/history', async (req: Request, res: Response) => {
        try {
            const since = req.query.since
                ? new Date(String(req.query.since))
                : new Date(Date.now() - 24 * 60 * 60 * 1000);
            const severity = req.query.severity
                ? String(req.query.severity).toUpperCase()
                : undefined;
            const limit = Math.min(parseInt(String(req.query.limit), 10) || 100, 500);

            const where: Record<string, unknown> = {
                timestamp: { gte: since },
            };
            if (severity) where.severity = severity;

            const events = await prisma.conjunctionEvent.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                take: limit,
            });

            res.json({ count: events.length, events });
        } catch (err) {
            routeLog.error({ err }, 'Failed to fetch conjunction history');
            res.status(500).json({ error: 'Failed to retrieve conjunction history' });
        }
    });

    // -----------------------------------------------------------------------
    // GET /internal/active-conjunctions — used by agent for LLM briefs
    // -----------------------------------------------------------------------
    router.get('/internal/active-conjunctions', (_req: Request, res: Response) => {
        const conjunctions = getLatestConjunctions()
            .filter((c: ConjunctionEvent) => !c.isIntraConstellation)
            .sort((a, b) => a.distanceKm - b.distanceKm)
            .slice(0, 20);
        res.json({ conjunctions });
    });

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
                routeLog.warn({ errors }, 'Agent push payload validation failed');
                res.status(400).json({ error: `Invalid payload: ${errors}` });
                return;
            }
            const payload = parsed.data as AgentPushPayload;
            const result = await processAgentPush(payload);
            routeLog.info({ score: payload.risk.score, level: payload.risk.level, isAlert: result.isAlert }, 'Agent push processed');

            broadcast('risk-update', {
                score: payload.risk.score,
                level: payload.risk.level,
                breakdown: payload.risk.breakdown,
                timestamp: payload.timestamp,
            });

            broadcast('space-weather', payload.spaceWeather);
            broadcast('eonet-events', payload.eonetEvents);

            if (payload.flarePathPredictions && payload.flarePathPredictions.length > 0) {
                broadcast('flare-path-predictions', payload.flarePathPredictions);
            }

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
            routeLog.error({ err }, 'Agent push processing failed');
            res.status(500).json({ error: 'Internal processing error' });
        }
    });

    // -----------------------------------------------------------------------
    // GET /api/flare-path-predictions — active CME path predictions
    // -----------------------------------------------------------------------
    router.get('/api/flare-path-predictions', (_req: Request, res: Response) => {
        const predictions = getFlarePathPredictions();
        const active = predictions.filter(
            (p) => new Date(p.arrivalWindowEnd) >= new Date(),
        );
        res.json({ count: active.length, predictions: active });
    });

    // -----------------------------------------------------------------------
    // GET /internal/satellite-positions — used by agent for CME impact analysis
    // -----------------------------------------------------------------------
    router.get('/internal/satellite-positions', (_req: Request, res: Response) => {
        res.json({ satellites: getEnrichedPositions() });
    });

    return router;
}
