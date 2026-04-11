import { Router, type Request, type Response } from 'express';
import axios from 'axios';
import { z } from 'zod';
import { logger } from './logger';
import type { NarrationRequest } from '@sentinel/shared';
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

// ---------------------------------------------------------------------------
// Threat triangle derivation
// ---------------------------------------------------------------------------

export interface ThreatTriangle {
    id: string;
    name: string;
    lat: number;
    lng: number;
    severity: 'EXTREME' | 'CRITICAL' | 'HIGH' | 'MODERATE';
    threatType: string;
}

interface ThreatState {
    spaceWeather: {
        xrayClass?: string | null;
        kpIndex?: number | null;
        protonFlux?: number | null;
        solarWindSpeed?: number | null;
        bz?: number | null;
    } | null;
    cmes: Array<{ activityID: string; speed?: number | null; startTime: string }>;
}

function computeThreatTriangles(state: ThreatState): ThreatTriangle[] {
    const threats: ThreatTriangle[] = [];
    const sw = state.spaceWeather;
    if (!sw) return threats;

    // X-ray flux class → solar flare
    const xray = sw.xrayClass ?? '';
    if (xray.startsWith('X')) {
        threats.push({
            id: 'flare-x',
            name: `${xray} SOLAR FLARE`,
            lat: 14,
            lng: -102,
            severity: 'EXTREME',
            threatType: 'SOLAR_FLARE_XCLASS',
        });
    } else if (xray.startsWith('M')) {
        const cls = parseFloat(xray.slice(1));
        if (!isNaN(cls) && cls >= 5) {
            threats.push({
                id: 'flare-m',
                name: `${xray} SOLAR FLARE`,
                lat: 14,
                lng: -102,
                severity: 'HIGH',
                threatType: 'SOLAR_FLARE_MCLASS',
            });
        }
    }

    // Kp index → geomagnetic storm
    const kp = sw.kpIndex ?? 0;
    if (kp >= 9) {
        threats.push({ id: 'geomag-g5', name: 'GEOMAGNETIC STORM G5', lat: 65, lng: 20, severity: 'EXTREME', threatType: 'GEOMAGNETIC_STORM_G5' });
    } else if (kp >= 7) {
        threats.push({ id: 'geomag-g4', name: 'GEOMAGNETIC STORM G4', lat: 65, lng: 20, severity: 'CRITICAL', threatType: 'GEOMAGNETIC_STORM_G4' });
    } else if (kp >= 5) {
        threats.push({ id: 'geomag-g3', name: 'GEOMAGNETIC STORM G3', lat: 65, lng: 20, severity: 'HIGH', threatType: 'GEOMAGNETIC_STORM_G3' });
    }

    // Proton flux → SEP or proton event
    const proton = sw.protonFlux ?? 0;
    if (proton >= 1000) {
        threats.push({ id: 'proton', name: 'SOLAR PROTON EVENT', lat: 11, lng: -96, severity: 'EXTREME', threatType: 'PROTON_FLUX' });
    } else if (proton >= 100) {
        threats.push({ id: 'sep', name: 'SOLAR ENERGETIC PARTICLE', lat: -15, lng: -48, severity: 'CRITICAL', threatType: 'SOLAR_ENERGETIC_PARTICLE' });
    } else if (proton >= 10) {
        threats.push({ id: 'sep', name: 'SOLAR ENERGETIC PARTICLE', lat: -15, lng: -48, severity: 'HIGH', threatType: 'SOLAR_ENERGETIC_PARTICLE' });
    }

    // Active CMEs
    const seenCme = new Set<string>();
    for (const cme of state.cmes) {
        const speed = cme.speed ?? 0;
        if (speed >= 2000 && !seenCme.has('extreme-cme')) {
            seenCme.add('extreme-cme');
            threats.push({ id: `cme-${cme.activityID}`, name: 'EXTREME CME', lat: 12, lng: -98, severity: 'EXTREME', threatType: 'EXTREME_CME' });
        } else if (speed >= 1000 && !seenCme.has('cme-halo')) {
            seenCme.add('cme-halo');
            threats.push({ id: `cme-${cme.activityID}`, name: 'CME EARTH-DIRECTED', lat: 64, lng: 21, severity: 'HIGH', threatType: 'CME_HALO' });
        }
    }

    // Southward IMF (BZ) → magnetosphere compression
    const bz = sw.bz ?? 0;
    if (bz < -20) {
        threats.push({ id: 'mag-compress', name: 'MAGNETOSPHERE COMPRESSION', lat: 1, lng: 104, severity: 'HIGH', threatType: 'MAGNETOSPHERE_COMPRESSION' });
    }

    // Elevated solar wind → atmospheric drag
    const wind = sw.solarWindSpeed ?? 0;
    if (wind > 600) {
        threats.push({ id: 'atm-drag', name: 'ATMOSPHERIC DRAG SPIKE', lat: 55, lng: 37, severity: 'MODERATE', threatType: 'ATMOSPHERIC_DRAG' });
    }

    return threats;
}

export interface RouterDeps {
    broadcast: (event: string, data: unknown) => void;
    getEnrichedPositions: () => SatPosition[];
    getTopRisk: () => SatRiskSummary[];
}

const narrationRequestBodySchema = z.object({
    objectType: z.enum(['satellite', 'threat', 'neo']),
    objectId: z.string().min(1),
    objectName: z.string().min(1),
});

/** Minimum ms between narration requests — protects ElevenLabs character limits. */
const NARRATION_COOLDOWN_MS = 1500;
let lastNarrationAt = 0;

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
    // GET /api/v1/status
    // -----------------------------------------------------------------------
    router.get('/api/v1/status', (_req: Request, res: Response) => {
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
    // GET /api/v1/satellites
    // -----------------------------------------------------------------------
    router.get('/api/v1/satellites', (req: Request, res: Response) => {
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
    // GET /api/v1/satellites/top-risk
    // -----------------------------------------------------------------------
    router.get('/api/v1/satellites/top-risk', (req: Request, res: Response) => {
        const count = Math.min(parseInt(req.query.count as string) || 20, 100);
        const topRisk = getTopRisk().slice(0, count);
        res.json({ count: topRisk.length, satellites: topRisk });
    });

    // -----------------------------------------------------------------------
    // GET /api/v1/satellites/risk-stats
    // -----------------------------------------------------------------------
    router.get('/api/v1/satellites/risk-stats', (_req: Request, res: Response) => {
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
    // GET /api/v1/satellites/:noradId
    // -----------------------------------------------------------------------
    router.get('/api/v1/satellites/:noradId', (req: Request, res: Response) => {
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
    // GET /api/v1/satellites/:noradId/risk
    // -----------------------------------------------------------------------
    router.get(
        '/api/v1/satellites/:noradId/risk',
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
    // GET /api/v1/alerts
    // -----------------------------------------------------------------------
    router.get('/api/v1/alerts', async (_req: Request, res: Response) => {
        try {
            const alerts = await getAlertHistory();
            res.json(alerts);
        } catch (err) {
            routeLog.error({ err }, 'Failed to fetch alert history');
            res.status(500).json({ error: 'Failed to retrieve alert history' });
        }
    });

    // -----------------------------------------------------------------------
    // GET /api/v1/space-weather
    // -----------------------------------------------------------------------
    router.get('/api/v1/space-weather', (_req: Request, res: Response) => {
        const weather = getLatestSpaceWeather();
        res.json(weather);
    });

    // -----------------------------------------------------------------------
    // GET /api/v1/events — active EONET events with coordinates
    // -----------------------------------------------------------------------
    router.get('/api/v1/events', (_req: Request, res: Response) => {
        const events = getLatestEonetEvents();
        res.json({ count: events.length, events });
    });

    // -----------------------------------------------------------------------
    // GET /api/v1/agent/brief
    // -----------------------------------------------------------------------
    router.get('/api/v1/agent/brief', (_req: Request, res: Response) => {
        const brief = getLatestBrief();
        if (!brief) {
            res.status(404).json({ error: 'No brief available' });
            return;
        }
        res.json(brief);
    });

    // -----------------------------------------------------------------------
    // POST /api/v1/agent/brief — proxy to agent
    // -----------------------------------------------------------------------
    router.post('/api/v1/agent/brief', async (_req: Request, res: Response) => {
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
    // GET /api/v1/agent/health — proxy to agent
    // -----------------------------------------------------------------------
    router.get('/api/v1/agent/health', async (_req: Request, res: Response) => {
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
    // GET /api/v1/agent/call-history — proxy to agent
    // -----------------------------------------------------------------------
    router.get(
        '/api/v1/agent/call-history',
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
    // POST /api/v1/agent/test-call — proxy to agent
    // -----------------------------------------------------------------------
    router.post(
        '/api/v1/agent/test-call',
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
    // POST /api/v1/agent/force-call — proxy to agent (no env guard)
    // -----------------------------------------------------------------------
    router.post(
        '/api/v1/agent/force-call',
        async (_req: Request, res: Response) => {
            try {
                const response = await axios.post(
                    `${AGENT_URL}/alerts/force-call`,
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
                    error: `Force call failed: ${message}`,
                });
            }
        },
    );

    // -----------------------------------------------------------------------
    // POST /api/v1/agent/orbit-suggestion — proxy to agent
    // -----------------------------------------------------------------------
    router.post(
        '/api/v1/agent/orbit-suggestion',
        async (req: Request, res: Response) => {
            try {
                const response = await axios.post(
                    `${AGENT_URL}/orbit-suggestion`,
                    req.body,
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
                    error: `Orbit suggestion failed: ${message}`,
                });
            }
        },
    );

    // -----------------------------------------------------------------------
    // POST /api/v1/narrate/stream — SSE-proxy Claude token stream from agent
    // -----------------------------------------------------------------------
    router.post('/api/v1/narrate/stream', async (req: Request, res: Response) => {
        const now = Date.now();
        if (now - lastNarrationAt < NARRATION_COOLDOWN_MS) {
            res.status(429).json({ error: 'Too many narration requests — wait a moment' });
            return;
        }

        const parsed = narrationRequestBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid request body' });
            return;
        }

        lastNarrationAt = now;

        try {
            const agentStream = await axios.post(
                `${AGENT_URL}/narrate/stream`,
                req.body,
                {
                    responseType: 'stream',
                    timeout: 35_000,
                    headers: { 'Content-Type': 'application/json' },
                },
            );

            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');

            (agentStream.data as NodeJS.ReadableStream).pipe(res);
            (agentStream.data as NodeJS.ReadableStream).on('error', (err: Error) => {
                routeLog.error({ err: err.message }, 'Narration SSE proxy error');
                if (!res.headersSent) res.status(502).json({ error: 'Stream proxy error' });
                else res.end();
            });
        } catch (err: unknown) {
            const axiosErr = err as { message?: string };
            routeLog.error({ err: axiosErr.message }, 'Narration stream proxy failed');
            if (!res.headersSent) res.status(502).json({ error: 'Stream proxy failed' });
        }
    });

    // -----------------------------------------------------------------------
    // POST /api/v1/narrate/audio — TTS a pre-generated script via ElevenLabs
    // -----------------------------------------------------------------------
    router.post('/api/v1/narrate/audio', async (req: Request, res: Response) => {
        const { script } = req.body as { script?: string };
        if (!script || typeof script !== 'string' || script.trim().length === 0) {
            res.status(400).json({ error: 'Missing or empty script' });
            return;
        }

        const elevenLabsKey   = process.env.ELEVENLABS_API_KEY;
        const elevenLabsVoice = process.env.ELEVENLABS_VOICE_ID;

        if (!elevenLabsKey || !elevenLabsVoice) {
            res.status(503).json({ error: 'TTS not configured' });
            return;
        }

        try {
            const ttsResponse = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoice}/stream`,
                {
                    text: script,
                    model_id: 'eleven_turbo_v2_5',
                    output_format: 'mp3_44100_128',
                },
                {
                    headers: {
                        'xi-api-key': elevenLabsKey,
                        'Content-Type': 'application/json',
                        Accept: 'audio/mpeg',
                    },
                    responseType: 'stream',
                    timeout: 30_000,
                },
            );

            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache');

            (ttsResponse.data as NodeJS.ReadableStream).pipe(res);
            (ttsResponse.data as NodeJS.ReadableStream).on('error', (err: Error) => {
                routeLog.error({ err: err.message }, 'ElevenLabs audio stream error');
                if (!res.headersSent) res.status(502).json({ error: 'TTS stream error' });
                else res.end();
            });
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
            const message = axiosErr.response?.data?.detail ?? axiosErr.message ?? 'Unknown error';
            routeLog.error({ err: message }, 'ElevenLabs audio request failed');
            if (!res.headersSent) res.status(502).json({ error: `TTS failed: ${message}` });
        }
    });

    // -----------------------------------------------------------------------
    // POST /api/v1/narrate — generate + stream TTS for a clicked globe object
    // -----------------------------------------------------------------------
    router.post('/api/v1/narrate', async (req: Request, res: Response) => {
        const now = Date.now();
        if (now - lastNarrationAt < NARRATION_COOLDOWN_MS) {
            res.status(429).json({ error: 'Too many narration requests — wait a moment' });
            return;
        }

        const parsed = narrationRequestBodySchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid request body' });
            return;
        }
        const narReq: NarrationRequest = parsed.data;

        const elevenLabsKey   = process.env.ELEVENLABS_API_KEY;
        const elevenLabsVoice = process.env.ELEVENLABS_VOICE_ID;

        if (!elevenLabsKey || !elevenLabsVoice) {
            // Return script as JSON so the frontend can display text fallback
            try {
                const scriptRes = await axios.post(`${AGENT_URL}/narrate`, narReq, { timeout: 30_000 });
                res.status(503).json({ error: 'TTS not configured', script: scriptRes.data.script ?? null });
            } catch {
                res.status(503).json({ error: 'TTS not configured', script: null });
            }
            return;
        }

        lastNarrationAt = now;

        try {
            // 1. Get narration script from agent
            const scriptResponse = await axios.post<{ script: string }>(
                `${AGENT_URL}/narrate`,
                narReq,
                { timeout: 30_000 },
            );
            const script = scriptResponse.data.script;
            if (!script || typeof script !== 'string') {
                throw new Error('Agent returned empty script');
            }

            // 2. Stream TTS from ElevenLabs
            const ttsResponse = await axios.post(
                `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoice}/stream`,
                {
                    text: script,
                    model_id: 'eleven_turbo_v2_5',
                    output_format: 'mp3_44100_128',
                },
                {
                    headers: {
                        'xi-api-key': elevenLabsKey,
                        'Content-Type': 'application/json',
                        Accept: 'audio/mpeg',
                    },
                    responseType: 'stream',
                    timeout: 30_000,
                },
            );

            // 3. Pipe audio stream directly to response
            res.setHeader('Content-Type', 'audio/mpeg');
            res.setHeader('Transfer-Encoding', 'chunked');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Narration-Object-Id', narReq.objectId);
            res.setHeader('X-Narration-Object-Type', narReq.objectType);

            (ttsResponse.data as NodeJS.ReadableStream).pipe(res);

            (ttsResponse.data as NodeJS.ReadableStream).on('error', (err: Error) => {
                routeLog.error({ err: err.message }, 'ElevenLabs stream error mid-pipe');
                if (!res.headersSent) {
                    res.status(502).json({ error: 'TTS stream error' });
                } else {
                    res.end();
                }
            });
        } catch (err: unknown) {
            const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
            const message = axiosErr.response?.data?.detail ?? axiosErr.message ?? 'Unknown error';
            routeLog.error({ err: message }, 'Narration pipeline failed');
            if (!res.headersSent) {
                res.status(502).json({ error: `Narration failed: ${message}` });
            }
        }
    });

    // -----------------------------------------------------------------------
    // GET /api/v1/conjunctions — active conjunctions
    // -----------------------------------------------------------------------
    router.get('/api/v1/conjunctions', (req: Request, res: Response) => {
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
    // GET /api/v1/conjunctions/:noradId — conjunctions for a specific satellite
    // -----------------------------------------------------------------------
    router.get('/api/v1/conjunctions/:noradId', (req: Request, res: Response) => {
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
    // GET /api/v1/conjunctions/history — historical events from DB
    // -----------------------------------------------------------------------
    router.get('/api/v1/conjunctions/history', async (req: Request, res: Response) => {
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
            broadcast('threat-triangles', computeThreatTriangles({
                spaceWeather: payload.spaceWeather,
                cmes: payload.cmes,
            }));

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
    // GET /api/v1/threat-triangles — active threat markers derived from space weather
    // -----------------------------------------------------------------------
    router.get('/api/v1/threat-triangles', (_req: Request, res: Response) => {
        const state = getLatestState();
        res.json({ threats: computeThreatTriangles(state) });
    });

    // -----------------------------------------------------------------------
    // GET /api/v1/flare-path-predictions — active CME path predictions
    // -----------------------------------------------------------------------
    router.get('/api/v1/flare-path-predictions', (_req: Request, res: Response) => {
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
