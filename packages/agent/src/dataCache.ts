import { prisma } from './prisma';

import type {
    RiskState,
    RiskBreakdown,
    MissionBrief,
    DONKIFlare,
    DONKICME,
    NEOObject,
    SpaceWeatherState,
} from '@sentinel/shared';

// ---------------------------------------------------------------------------
// Space Weather Readings (SWPC raw data)
// ---------------------------------------------------------------------------

export async function upsertSpaceWeather(
    source: string,
    data: unknown,
): Promise<void> {
    await prisma.spaceWeatherReading.create({
        data: { source, data: data as object },
    });
}

export async function getLatestSpaceWeather(
    source: string,
): Promise<unknown | null> {
    const record = await prisma.spaceWeatherReading.findFirst({
        where: { source },
        orderBy: { processedAt: 'desc' },
    });
    return record?.data ?? null;
}

// ---------------------------------------------------------------------------
// DONKI Flares
// ---------------------------------------------------------------------------

export async function upsertFlares(flares: DONKIFlare[]): Promise<void> {
    if (flares.length === 0) return;

    await prisma.$transaction(
        flares.map((f) =>
            prisma.donkiFlare.upsert({
                where: { flrID: f.flrID },
                update: {
                    classType: f.classType,
                    beginTime: new Date(f.beginTime),
                    peakTime: new Date(f.peakTime),
                    endTime: f.endTime ? new Date(f.endTime) : null,
                    sourceLocation: f.sourceLocation,
                    fetchedAt: new Date(),
                },
                create: {
                    flrID: f.flrID,
                    classType: f.classType,
                    beginTime: new Date(f.beginTime),
                    peakTime: new Date(f.peakTime),
                    endTime: f.endTime ? new Date(f.endTime) : null,
                    sourceLocation: f.sourceLocation,
                },
            }),
        ),
    );
}

export async function getRecentFlares(since: Date): Promise<DONKIFlare[]> {
    const records = await prisma.donkiFlare.findMany({
        where: { peakTime: { gte: since } },
        orderBy: { peakTime: 'desc' },
    });
    return records.map((r) => ({
        flrID: r.flrID,
        classType: r.classType,
        beginTime: r.beginTime.toISOString(),
        peakTime: r.peakTime.toISOString(),
        endTime: r.endTime?.toISOString() ?? null,
        sourceLocation: r.sourceLocation,
    }));
}

// ---------------------------------------------------------------------------
// DONKI CMEs
// ---------------------------------------------------------------------------

export async function upsertCMEs(cmes: DONKICME[]): Promise<void> {
    if (cmes.length === 0) return;

    await prisma.$transaction(
        cmes.map((c) =>
            prisma.donkiCME.upsert({
                where: { activityID: c.activityID },
                update: {
                    startTime: new Date(c.startTime),
                    speed: c.speed,
                    type: c.type,
                    fetchedAt: new Date(),
                },
                create: {
                    activityID: c.activityID,
                    startTime: new Date(c.startTime),
                    speed: c.speed,
                    type: c.type,
                },
            }),
        ),
    );
}

export async function getRecentCMEs(since: Date): Promise<DONKICME[]> {
    const records = await prisma.donkiCME.findMany({
        where: { startTime: { gte: since } },
        orderBy: { startTime: 'desc' },
    });
    return records.map((r) => ({
        activityID: r.activityID,
        startTime: r.startTime.toISOString(),
        speed: r.speed,
        type: r.type,
    }));
}

// ---------------------------------------------------------------------------
// NEO Objects
// ---------------------------------------------------------------------------

export async function upsertNeos(neos: NEOObject[]): Promise<void> {
    if (neos.length === 0) return;

    await prisma.$transaction(
        neos.map((n) =>
            prisma.neoObject.upsert({
                where: { neoId: n.id },
                update: {
                    name: n.name,
                    estimatedDiameter: n.estimatedDiameter,
                    isPotentiallyHazardous: n.isPotentiallyHazardous,
                    closeApproachDate: new Date(n.closeApproachDate),
                    missDistanceKm: n.missDistanceKm,
                    relativeVelocityKmS: n.relativeVelocityKmS,
                    fetchedAt: new Date(),
                },
                create: {
                    neoId: n.id,
                    name: n.name,
                    estimatedDiameter: n.estimatedDiameter,
                    isPotentiallyHazardous: n.isPotentiallyHazardous,
                    closeApproachDate: new Date(n.closeApproachDate),
                    missDistanceKm: n.missDistanceKm,
                    relativeVelocityKmS: n.relativeVelocityKmS,
                },
            }),
        ),
    );
}

export async function getUpcomingNeos(
    withinDays: number,
): Promise<NEOObject[]> {
    const now = new Date();
    const future = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
    const records = await prisma.neoObject.findMany({
        where: {
            closeApproachDate: { gte: now, lte: future },
        },
        orderBy: { closeApproachDate: 'asc' },
    });
    return records.map((r) => ({
        id: r.neoId,
        name: r.name,
        estimatedDiameter: r.estimatedDiameter,
        isPotentiallyHazardous: r.isPotentiallyHazardous,
        closeApproachDate: r.closeApproachDate.toISOString(),
        missDistanceKm: r.missDistanceKm,
        relativeVelocityKmS: r.relativeVelocityKmS,
    }));
}

// ---------------------------------------------------------------------------
// EONET Events
// ---------------------------------------------------------------------------

interface EonetEventInput {
    eventId: string;
    title: string;
    category: string;
    source: string;
    link: string | null;
    date: string;
    coordinates: unknown;
}

export async function upsertEonetEvents(
    events: EonetEventInput[],
): Promise<void> {
    if (events.length === 0) return;

    await prisma.$transaction(
        events.map((e) =>
            prisma.eonetEvent.upsert({
                where: { eventId: e.eventId },
                update: {
                    title: e.title,
                    category: e.category,
                    source: e.source,
                    link: e.link,
                    date: new Date(e.date),
                    coordinates: e.coordinates as object | undefined,
                    fetchedAt: new Date(),
                },
                create: {
                    eventId: e.eventId,
                    title: e.title,
                    category: e.category,
                    source: e.source,
                    link: e.link,
                    date: new Date(e.date),
                    coordinates: e.coordinates as object | undefined,
                },
            }),
        ),
    );
}

export async function getActiveEonetEvents(): Promise<EonetEventInput[]> {
    const records = await prisma.eonetEvent.findMany({
        orderBy: { date: 'desc' },
        take: 20,
    });
    return records.map((r) => ({
        eventId: r.eventId,
        title: r.title,
        category: r.category,
        source: r.source,
        link: r.link,
        date: r.date.toISOString(),
        coordinates: r.coordinates,
    }));
}

// ---------------------------------------------------------------------------
// Risk Assessments
// ---------------------------------------------------------------------------

export async function saveRiskAssessment(risk: RiskState): Promise<void> {
    await prisma.riskAssessment.create({
        data: {
            score: risk.score,
            level: risk.level,
            breakdown: risk.breakdown as unknown as object,
        },
    });
}

export async function getLatestRisk(): Promise<RiskState | null> {
    const record = await prisma.riskAssessment.findFirst({
        orderBy: { createdAt: 'desc' },
    });
    if (!record) return null;
    return {
        score: record.score,
        level: record.level as RiskState['level'],
        breakdown: record.breakdown as unknown as RiskBreakdown,
        timestamp: record.createdAt.toISOString(),
    };
}

export async function getPreviousRisk(): Promise<RiskState | null> {
    const records = await prisma.riskAssessment.findMany({
        orderBy: { createdAt: 'desc' },
        take: 2,
    });
    if (records.length < 2) return null;
    const prev = records[1];
    return {
        score: prev.score,
        level: prev.level as RiskState['level'],
        breakdown: prev.breakdown as unknown as RiskBreakdown,
        timestamp: prev.createdAt.toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Mission Briefs
// ---------------------------------------------------------------------------

export async function saveMissionBrief(brief: MissionBrief): Promise<void> {
    await prisma.missionBrief.create({
        data: {
            recommendation: brief.recommendation,
            summary: brief.summary,
            threats: brief.threats as unknown as object,
            maneuverWindows: brief.maneuverWindows as unknown as object,
            confidence: brief.confidence,
            isLlm: brief.isLlm,
        },
    });
}

export async function getLatestBrief(): Promise<MissionBrief | null> {
    const record = await prisma.missionBrief.findFirst({
        orderBy: { generatedAt: 'desc' },
    });
    if (!record) return null;
    return {
        recommendation: record.recommendation as MissionBrief['recommendation'],
        summary: record.summary,
        threats: record.threats as unknown as string[],
        maneuverWindows: record.maneuverWindows as unknown as string[],
        confidence: record.confidence,
        generatedAt: record.generatedAt.toISOString(),
        isLlm: record.isLlm,
    };
}

// ---------------------------------------------------------------------------
// Poll Status Tracking
// ---------------------------------------------------------------------------

export async function updatePollStatus(
    source: string,
    success: boolean,
    errorMessage?: string,
): Promise<void> {
    await prisma.pollStatus.upsert({
        where: { source },
        update: {
            lastPollAt: new Date(),
            lastSuccess: success,
            errorMessage: errorMessage ?? null,
        },
        create: {
            source,
            lastPollAt: new Date(),
            lastSuccess: success,
            errorMessage: errorMessage ?? null,
        },
    });
}

export async function getPollStatuses(): Promise<
    Array<{
        source: string;
        lastPollAt: Date;
        lastSuccess: boolean;
        errorMessage: string | null;
    }>
    > {
    return prisma.pollStatus.findMany();
}

// ---------------------------------------------------------------------------
// Utility: Build SpaceWeatherState from latest SWPC readings
// ---------------------------------------------------------------------------

export async function buildSpaceWeatherState(): Promise<SpaceWeatherState> {
    const [xrayData, kpData, protonData, windData, magData] = await Promise.all(
        [
            getLatestSpaceWeather('swpc-xray'),
            getLatestSpaceWeather('swpc-kp'),
            getLatestSpaceWeather('swpc-protons'),
            getLatestSpaceWeather('swpc-wind'),
            getLatestSpaceWeather('swpc-mag'),
        ],
    );

    return {
        xrayClass: extractXrayClass(xrayData),
        kpIndex: extractKpIndex(kpData),
        protonFlux: extractProtonFlux(protonData),
        solarWindSpeed: extractSolarWindSpeed(windData),
        bz: extractBz(magData),
        timestamp: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// SWPC data extractors
// ---------------------------------------------------------------------------

function extractXrayClass(data: unknown): string | null {
    if (!Array.isArray(data) || data.length === 0) return null;
    const latest = data[data.length - 1];
    const flux = parseFloat(latest?.flux ?? latest?.current_int_xrlong ?? '0');
    if (isNaN(flux) || flux <= 0) return null;
    return classifyXrayFlux(flux);
}

export function classifyXrayFlux(flux: number): string {
    if (flux >= 1e-4) {
        const level = Math.floor(flux / 1e-4);
        return `X${Math.min(level, 99)}`;
    }
    if (flux >= 1e-5) {
        const level = Math.round((flux / 1e-5) * 10) / 10;
        return `M${level.toFixed(1)}`;
    }
    if (flux >= 1e-6) {
        const level = Math.round((flux / 1e-6) * 10) / 10;
        return `C${level.toFixed(1)}`;
    }
    if (flux >= 1e-7) {
        const level = Math.round((flux / 1e-7) * 10) / 10;
        return `B${level.toFixed(1)}`;
    }
    return 'A';
}

function extractKpIndex(data: unknown): number | null {
    if (!Array.isArray(data) || data.length < 2) return null;
    // First row is header, last row is most recent
    const latest = data[data.length - 1];
    const kp = parseFloat(
        Array.isArray(latest) ? latest[1] : (latest?.kp_index ?? '0'),
    );
    return isNaN(kp) ? null : kp;
}

function extractProtonFlux(data: unknown): number | null {
    if (!Array.isArray(data) || data.length === 0) return null;
    const latest = data[data.length - 1];
    const flux = parseFloat(latest?.flux ?? latest?.proton_flux ?? '0');
    return isNaN(flux) ? null : flux;
}

function extractSolarWindSpeed(data: unknown): number | null {
    if (!Array.isArray(data) || data.length < 2) return null;
    // First row is header, last row is most recent
    const latest = data[data.length - 1];
    const speed = parseFloat(
        Array.isArray(latest) ? latest[1] : (latest?.speed ?? '0'),
    );
    return isNaN(speed) ? null : speed;
}

function extractBz(data: unknown): number | null {
    if (!Array.isArray(data) || data.length < 2) return null;
    // First row is header, last row is most recent
    const latest = data[data.length - 1];
    const bz = parseFloat(
        Array.isArray(latest) ? latest[3] : (latest?.bz_gsm ?? '0'),
    );
    return isNaN(bz) ? null : bz;
}
