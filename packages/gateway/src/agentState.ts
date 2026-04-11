import { v4 as uuid } from 'uuid';

import prisma from './db';
import { logger } from './logger';
import type {
    AgentPushPayload,
    AlertRecord,
    RiskState,
    RiskLevel,
    RiskBreakdown,
    MissionBrief,
    SpaceWeatherState,
    DONKIFlare,
    DONKICME,
    NEOObject,
    EonetEvent,
    FlarePathPrediction,
} from '@sentinel/shared';

const log = logger.child({ component: 'AgentState' });

// ---------------------------------------------------------------------------
// In-memory hot cache (latest state only)
// ---------------------------------------------------------------------------

interface LatestState {
    risk: RiskState | null;
    brief: MissionBrief | null;
    spaceWeather: SpaceWeatherState | null;
    flares: DONKIFlare[];
    cmes: DONKICME[];
    neos: NEOObject[];
    eonetEvents: EonetEvent[];
    flarePathPredictions: FlarePathPrediction[];
    lastUpdate: string | null;
}

const latest: LatestState = {
    risk: null,
    brief: null,
    spaceWeather: null,
    flares: [],
    cmes: [],
    neos: [],
    eonetEvents: [],
    flarePathPredictions: [],
    lastUpdate: null,
};

// ---------------------------------------------------------------------------
// Public read accessors (hot path — no DB round-trip)
// ---------------------------------------------------------------------------

export function getLatestRisk(): RiskState | null {
    return latest.risk;
}

export function getLatestBrief(): MissionBrief | null {
    return latest.brief;
}

export function getLatestSpaceWeather(): SpaceWeatherState | null {
    return latest.spaceWeather;
}

export function getLatestEonetEvents(): EonetEvent[] {
    return latest.eonetEvents;
}

export function getFlarePathPredictions(): FlarePathPrediction[] {
    return latest.flarePathPredictions;
}

export function getLatestState(): LatestState {
    return { ...latest };
}

// ---------------------------------------------------------------------------
// Alert history (cold path — Prisma query)
// ---------------------------------------------------------------------------

export async function getAlertHistory(
    limit: number = 100,
): Promise<AlertRecord[]> {
    const rows = await prisma.alertRecord.findMany({
        orderBy: { timestamp: 'desc' },
        take: limit,
    });

    log.debug({ limit, count: rows.length }, 'Alert history queried');

    return rows.map((row) => ({
        id: row.id,
        level: row.level as RiskLevel,
        score: row.score,
        brief: row.brief,
        timestamp: row.timestamp.toISOString(),
    }));
}

// ---------------------------------------------------------------------------
// Agent push handler (write-through)
// ---------------------------------------------------------------------------

export interface AgentPushResult {
    received: true;
    isAlert: boolean;
}

export async function processAgentPush(
    payload: AgentPushPayload,
): Promise<AgentPushResult> {
    const previousLevel = latest.risk?.level ?? null;
    const isAlert =
        previousLevel !== null && previousLevel !== payload.risk.level;

    // 1. Persist snapshot to Postgres
    await prisma.agentSnapshot.create({
        data: {
            score: payload.risk.score,
            level: payload.risk.level,
            breakdown: payload.risk.breakdown as object,
            brief: payload.brief ? (payload.brief as object) : undefined,
            spaceWeather: payload.spaceWeather as object,
            flares: payload.flares as object[],
            cmes: payload.cmes as object[],
            neos: payload.neos as object[],
            eonetEvents: payload.eonetEvents as object[],
            timestamp: new Date(payload.timestamp),
        },
    });

    // 2. Persist space weather reading
    await prisma.spaceWeatherReading.create({
        data: {
            xrayClass: payload.spaceWeather.xrayClass,
            kpIndex: payload.spaceWeather.kpIndex,
            protonFlux: payload.spaceWeather.protonFlux,
            solarWindSpeed: payload.spaceWeather.solarWindSpeed,
            bz: payload.spaceWeather.bz,
            timestamp: new Date(payload.timestamp),
        },
    });

    // 3. Create alert record on level transition
    if (isAlert) {
        await prisma.alertRecord.create({
            data: {
                id: uuid(),
                level: payload.risk.level,
                score: payload.risk.score,
                brief: payload.brief?.summary ?? 'No brief available',
                riskState: payload.risk as object,
                timestamp: new Date(payload.timestamp),
            },
        });
    }

    // 4. Update in-memory hot cache
    latest.risk = payload.risk;
    latest.brief = payload.brief;
    latest.spaceWeather = payload.spaceWeather;
    latest.flares = payload.flares;
    latest.cmes = payload.cmes;
    latest.neos = payload.neos;
    latest.eonetEvents = payload.eonetEvents;
    latest.flarePathPredictions = payload.flarePathPredictions ?? [];
    latest.lastUpdate = payload.timestamp;

    log.debug({ isAlert, score: payload.risk.score, level: payload.risk.level }, 'Agent push processed and cached');

    return { received: true, isAlert };
}

// ---------------------------------------------------------------------------
// Hydrate in-memory cache from DB on startup
// ---------------------------------------------------------------------------

export async function hydrateFromDb(): Promise<void> {
    const snapshot = await prisma.agentSnapshot.findFirst({
        orderBy: { timestamp: 'desc' },
    });

    if (snapshot) {
        latest.risk = {
            score: snapshot.score,
            level: snapshot.level as RiskLevel,
            breakdown: snapshot.breakdown as unknown as RiskBreakdown,
            timestamp: snapshot.timestamp.toISOString(),
        };
        latest.brief = snapshot.brief as unknown as MissionBrief | null;
        latest.spaceWeather =
            snapshot.spaceWeather as unknown as SpaceWeatherState;
        latest.flares = snapshot.flares as unknown as DONKIFlare[];
        latest.cmes = snapshot.cmes as unknown as DONKICME[];
        latest.neos = snapshot.neos as unknown as NEOObject[];
        latest.eonetEvents = (snapshot as Record<string, unknown>).eonetEvents as unknown as EonetEvent[] ?? [];
        latest.lastUpdate = snapshot.timestamp.toISOString();
        log.info(
            { timestamp: snapshot.timestamp.toISOString() },
            'Hydrated state from database',
        );
    } else {
        log.info('No prior snapshots found, starting fresh');
    }
}
