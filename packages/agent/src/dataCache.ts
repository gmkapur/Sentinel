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
// In-memory store — no database needed. Data repopulates from pollers on
// every startup and is pushed to the gateway for persistence.
// ---------------------------------------------------------------------------

const spaceWeather = new Map<string, { data: unknown; timestamp: Date }>();
let flares: DONKIFlare[] = [];
let cmes: DONKICME[] = [];
let neos: NEOObject[] = [];

interface EonetEventInput {
    eventId: string;
    title: string;
    category: string;
    source: string;
    link: string | null;
    date: string;
    coordinates: unknown;
}
let eonetEvents: EonetEventInput[] = [];

const riskHistory: RiskState[] = []; // keep last 2
let latestBrief: MissionBrief | null = null;

const pollStatuses = new Map<
    string,
    { lastPollAt: Date; lastSuccess: boolean; errorMessage: string | null }
>();

// ---------------------------------------------------------------------------
// Space Weather Readings (SWPC raw data)
// ---------------------------------------------------------------------------

export async function upsertSpaceWeather(
    source: string,
    data: unknown,
): Promise<void> {
    spaceWeather.set(source, { data, timestamp: new Date() });
}

export async function getLatestSpaceWeather(
    source: string,
): Promise<unknown | null> {
    return spaceWeather.get(source)?.data ?? null;
}

// ---------------------------------------------------------------------------
// DONKI Flares
// ---------------------------------------------------------------------------

export async function upsertFlares(incoming: DONKIFlare[]): Promise<void> {
    if (incoming.length === 0) return;

    const byId = new Map(flares.map((f) => [f.flrID, f]));
    for (const f of incoming) {
        byId.set(f.flrID, f);
    }
    // Prune older than 30 days
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    flares = [...byId.values()].filter(
        (f) => new Date(f.peakTime) >= cutoff,
    );
}

export async function getRecentFlares(since: Date): Promise<DONKIFlare[]> {
    return flares
        .filter((f) => new Date(f.peakTime) >= since)
        .sort(
            (a, b) =>
                new Date(b.peakTime).getTime() -
                new Date(a.peakTime).getTime(),
        );
}

// ---------------------------------------------------------------------------
// DONKI CMEs
// ---------------------------------------------------------------------------

export async function upsertCMEs(incoming: DONKICME[]): Promise<void> {
    if (incoming.length === 0) return;

    const byId = new Map(cmes.map((c) => [c.activityID, c]));
    for (const c of incoming) {
        byId.set(c.activityID, c);
    }
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    cmes = [...byId.values()].filter(
        (c) => new Date(c.startTime) >= cutoff,
    );
}

export async function getRecentCMEs(since: Date): Promise<DONKICME[]> {
    return cmes
        .filter((c) => new Date(c.startTime) >= since)
        .sort(
            (a, b) =>
                new Date(b.startTime).getTime() -
                new Date(a.startTime).getTime(),
        );
}

// ---------------------------------------------------------------------------
// NEO Objects
// ---------------------------------------------------------------------------

export async function upsertNeos(incoming: NEOObject[]): Promise<void> {
    if (incoming.length === 0) return;

    const byId = new Map(neos.map((n) => [n.id, n]));
    for (const n of incoming) {
        byId.set(n.id, n);
    }
    neos = [...byId.values()];
}

export async function getUpcomingNeos(
    withinDays: number,
): Promise<NEOObject[]> {
    const now = new Date();
    const future = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);
    return neos
        .filter((n) => {
            const d = new Date(n.closeApproachDate);
            return d >= now && d <= future;
        })
        .sort(
            (a, b) =>
                new Date(a.closeApproachDate).getTime() -
                new Date(b.closeApproachDate).getTime(),
        );
}

// ---------------------------------------------------------------------------
// EONET Events
// ---------------------------------------------------------------------------

export async function upsertEonetEvents(
    events: EonetEventInput[],
): Promise<void> {
    if (events.length === 0) return;

    const byId = new Map(eonetEvents.map((e) => [e.eventId, e]));
    for (const e of events) {
        byId.set(e.eventId, e);
    }
    // Keep newest 20
    eonetEvents = [...byId.values()]
        .sort(
            (a, b) =>
                new Date(b.date).getTime() - new Date(a.date).getTime(),
        )
        .slice(0, 20);
}

export async function getActiveEonetEvents(): Promise<EonetEventInput[]> {
    return eonetEvents;
}

// ---------------------------------------------------------------------------
// Risk Assessments
// ---------------------------------------------------------------------------

export async function saveRiskAssessment(risk: RiskState): Promise<void> {
    riskHistory.push(risk);
    // Keep only the last 2
    if (riskHistory.length > 2) {
        riskHistory.splice(0, riskHistory.length - 2);
    }
}

export async function getLatestRisk(): Promise<RiskState | null> {
    return riskHistory.length > 0
        ? riskHistory[riskHistory.length - 1]
        : null;
}

export async function getPreviousRisk(): Promise<RiskState | null> {
    return riskHistory.length >= 2
        ? riskHistory[riskHistory.length - 2]
        : null;
}

// ---------------------------------------------------------------------------
// Mission Briefs
// ---------------------------------------------------------------------------

export async function saveMissionBrief(brief: MissionBrief): Promise<void> {
    latestBrief = brief;
}

export async function getLatestBrief(): Promise<MissionBrief | null> {
    return latestBrief;
}

// ---------------------------------------------------------------------------
// Poll Status Tracking
// ---------------------------------------------------------------------------

export async function updatePollStatus(
    source: string,
    success: boolean,
    errorMessage?: string,
): Promise<void> {
    pollStatuses.set(source, {
        lastPollAt: new Date(),
        lastSuccess: success,
        errorMessage: errorMessage ?? null,
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
    return [...pollStatuses.entries()].map(([source, status]) => ({
        source,
        ...status,
    }));
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
    const latest = data[data.length - 1];
    const speed = parseFloat(
        Array.isArray(latest) ? latest[1] : (latest?.speed ?? '0'),
    );
    return isNaN(speed) ? null : speed;
}

function extractBz(data: unknown): number | null {
    if (!Array.isArray(data) || data.length < 2) return null;
    const latest = data[data.length - 1];
    const bz = parseFloat(
        Array.isArray(latest) ? latest[3] : (latest?.bz_gsm ?? '0'),
    );
    return isNaN(bz) ? null : bz;
}
