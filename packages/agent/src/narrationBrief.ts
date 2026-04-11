import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type {
    RiskState,
    SpaceWeatherState,
    DONKIFlare,
    DONKICME,
    NEOObject,
    SatRiskSummary,
    ConjunctionEvent,
    NarrationRequest,
    NarrationScript,
} from '@sentinel/shared';

import { logger } from './logger';

const log = logger.child({ component: 'Narration' });

const MODEL = 'claude-sonnet-4-20250514';

// ---------------------------------------------------------------------------
// Zod validation
// ---------------------------------------------------------------------------

const narrationScriptSchema = z.object({
    script: z.string().min(10).max(600),
});

// ---------------------------------------------------------------------------
// Anthropic client (lazy, same pattern as llmBrief.ts)
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!client) client = new Anthropic();
    return client;
}

// ---------------------------------------------------------------------------
// System prompts per objectType
// ---------------------------------------------------------------------------

const SYSTEM_PROMPTS: Record<NarrationRequest['objectType'], string> = {
    satellite: `You are Orbit Sentinel's voice briefing system. Generate a concise spoken brief for the satellite below.

Rules:
- Exactly 2 sentences. No more.
- Sentence 1: name the satellite and its current top threat or risk level.
- Sentence 2: give one concrete action the operator should take right now.
- Natural spoken prose — no bullet points, no markdown, no numbers.
- Return ONLY the plain prose text.`,

    threat: `You are Orbit Sentinel's voice briefing system. Generate a concise spoken brief for the space weather threat below.

Rules:
- Exactly 2 sentences. No more.
- Sentence 1: name the threat, its severity, and which orbit regimes are most affected.
- Sentence 2: give one concrete recommended action for affected operators.
- Natural spoken prose — no bullet points, no markdown.
- Return ONLY the plain prose text.`,

    neo: `You are Orbit Sentinel's voice briefing system. Generate a concise spoken brief for the near-Earth object below.

Rules:
- Exactly 2 sentences. No more.
- Sentence 1: name the object, its close-approach date, miss distance, and hazard classification.
- Sentence 2: give a monitoring recommendation for satellite operators.
- Natural spoken prose — no bullet points, no markdown.
- Return ONLY the plain prose text.`,
};

// ---------------------------------------------------------------------------
// Context builder
// ---------------------------------------------------------------------------

function buildNarrationContext(
    req: NarrationRequest,
    risk: RiskState | null,
    weather: SpaceWeatherState | null,
    flares: DONKIFlare[],
    cmes: DONKICME[],
    neos: NEOObject[],
    topRisk: SatRiskSummary[],
    conjunctions: ConjunctionEvent[],
): string {
    const lines: string[] = [];

    lines.push(`OBJECT TYPE: ${req.objectType.toUpperCase()}`);
    lines.push(`OBJECT ID: ${req.objectId}`);
    lines.push(`OBJECT NAME: ${req.objectName}`);
    lines.push('');

    if (risk) {
        lines.push(`OVERALL MISSION RISK: ${risk.level} (score ${risk.score}/100)`);
        const bd = risk.breakdown;
        lines.push(`Risk breakdown — flare:${bd.flare} geomagnetic:${bd.geomagnetic} radiation:${bd.radiation} solarWind:${bd.solarWind} neo:${bd.neo} cmePath:${bd.cmePath ?? 0} compound:${bd.compound}`);
        lines.push('');
    }

    if (weather) {
        lines.push('SPACE WEATHER:');
        if (weather.xrayClass) lines.push(`  X-ray class: ${weather.xrayClass}`);
        if (weather.kpIndex !== null) lines.push(`  Kp index: ${weather.kpIndex}`);
        if (weather.protonFlux !== null) lines.push(`  Proton flux: ${weather.protonFlux} pfu`);
        if (weather.solarWindSpeed !== null) lines.push(`  Solar wind speed: ${weather.solarWindSpeed} km/s`);
        if (weather.bz !== null) lines.push(`  IMF Bz: ${weather.bz} nT`);
        lines.push('');
    }

    if (flares.length > 0) {
        lines.push('RECENT SOLAR FLARES:');
        for (const f of flares.slice(0, 3)) {
            lines.push(`  ${f.classType} — peaked ${f.peakTime} at ${f.sourceLocation}`);
        }
        lines.push('');
    }

    if (cmes.length > 0) {
        lines.push('RECENT CMEs:');
        for (const c of cmes.slice(0, 2)) {
            const spd = c.speed !== null ? `${c.speed} km/s` : 'speed unknown';
            lines.push(`  ${c.activityID} — ${spd}, started ${c.startTime}`);
        }
        lines.push('');
    }

    if (req.objectType === 'satellite' || req.objectType === 'threat') {
        if (topRisk.length > 0) {
            lines.push('TOP AT-RISK SATELLITES:');
            for (const s of topRisk.slice(0, 5)) {
                lines.push(`  ${s.name} (NORAD ${s.noradId}) — ${s.orbitRegime} ${Math.round(s.altitude)} km — risk ${s.riskLevel} (${s.riskScore})`);
            }
            lines.push('');
        }
    }

    if (req.objectType === 'satellite') {
        const norad = parseInt(req.objectId, 10);
        const satConjs = !isNaN(norad)
            ? conjunctions.filter((c) => c.sat1Id === norad || c.sat2Id === norad)
            : [];
        if (satConjs.length > 0) {
            lines.push('CONJUNCTIONS FOR THIS SATELLITE:');
            for (const c of satConjs.slice(0, 4)) {
                const other = c.sat1Id === norad ? c.sat2Name : c.sat1Name;
                lines.push(`  vs ${other} — ${c.distanceKm.toFixed(1)} km — severity ${c.severity}`);
            }
            lines.push('');
        }
    }

    if (req.objectType === 'neo' && neos.length > 0) {
        const match = neos.find((n) => n.id === req.objectId) ?? neos[0];
        lines.push('NEO DETAILS:');
        lines.push(`  Name: ${match.name}`);
        lines.push(`  Close approach: ${match.closeApproachDate}`);
        lines.push(`  Miss distance: ${Math.round(match.missDistanceKm).toLocaleString()} km`);
        lines.push(`  Relative velocity: ${match.relativeVelocityKmS.toFixed(1)} km/s`);
        lines.push(`  Potentially hazardous: ${match.isPotentiallyHazardous ? 'YES' : 'NO'}`);
        lines.push(`  Estimated diameter: ${match.estimatedDiameter.toFixed(3)} km`);
        lines.push('');
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Fallback (deterministic, no LLM)
// ---------------------------------------------------------------------------

export function generateFallbackNarrationScript(
    req: NarrationRequest,
    risk: RiskState | null,
): NarrationScript {
    const level = risk?.level ?? 'LOW';
    const score = risk?.score ?? 0;

    let script: string;
    switch (req.objectType) {
        case 'satellite':
            script = `Satellite ${req.objectName} is currently tracking at ${level} risk, scoring ${score} out of 100. Maintain standard monitoring protocols and check the dashboard for the latest space weather conditions.`;
            break;
        case 'threat':
            script = `Threat event ${req.objectName} is active with overall mission risk at ${level}, scoring ${score} out of 100. Operators in affected orbit regimes should check the dashboard for full advisory details.`;
            break;
        case 'neo':
        default:
            script = `Near-Earth object ${req.objectName} is being tracked in the proximity catalog with mission risk at ${level}, scoring ${score} out of 100. Continue standard monitoring and consult the dashboard for updated orbital parameters.`;
            break;
    }

    return {
        objectType: req.objectType,
        objectId: req.objectId,
        objectName: req.objectName,
        script,
        generatedAt: new Date().toISOString(),
    };
}

// ---------------------------------------------------------------------------
// Streaming generation — yields text tokens as Claude emits them
// ---------------------------------------------------------------------------

export async function* streamNarrationTokens(
    req: NarrationRequest,
    risk: RiskState | null,
    weather: SpaceWeatherState | null,
    flares: DONKIFlare[],
    cmes: DONKICME[],
    neos: NEOObject[],
    topRisk: SatRiskSummary[],
    conjunctions: ConjunctionEvent[],
): AsyncGenerator<string, void, unknown> {
    const anthropic = getClient();
    if (!anthropic) {
        log.info({ objectId: req.objectId }, 'No ANTHROPIC_API_KEY — streaming fallback narration');
        const fallback = generateFallbackNarrationScript(req, risk);
        yield fallback.script;
        return;
    }

    try {
        const userPrompt = buildNarrationContext(req, risk, weather, flares, cmes, neos, topRisk, conjunctions);
        const stream = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 150,
            system: SYSTEM_PROMPTS[req.objectType],
            messages: [{ role: 'user', content: userPrompt }],
        });

        for await (const event of stream) {
            if (
                event.type === 'content_block_delta' &&
                event.delta.type === 'text_delta' &&
                event.delta.text
            ) {
                yield event.delta.text;
            }
        }
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error({ err: msg }, 'Claude streaming narration failed, yielding fallback');
        const fallback = generateFallbackNarrationScript(req, risk);
        yield fallback.script;
    }
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

export async function generateNarrationScript(
    req: NarrationRequest,
    risk: RiskState | null,
    weather: SpaceWeatherState | null,
    flares: DONKIFlare[],
    cmes: DONKICME[],
    neos: NEOObject[],
    topRisk: SatRiskSummary[],
    conjunctions: ConjunctionEvent[],
): Promise<NarrationScript> {
    const anthropic = getClient();
    if (!anthropic) {
        log.info({ objectId: req.objectId }, 'No ANTHROPIC_API_KEY — using fallback narration');
        return generateFallbackNarrationScript(req, risk);
    }

    try {
        const userPrompt = buildNarrationContext(req, risk, weather, flares, cmes, neos, topRisk, conjunctions);

        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 150,
            system: SYSTEM_PROMPTS[req.objectType],
            messages: [{ role: 'user', content: userPrompt }],
        });

        const textBlock = response.content.find((b) => b.type === 'text');
        if (!textBlock || textBlock.type !== 'text') {
            throw new Error('No text content in Claude response');
        }

        // Claude returns plain prose — wrap in an object for schema validation
        const validated = narrationScriptSchema.safeParse({ script: textBlock.text.trim() });
        if (!validated.success) {
            log.warn({ errors: validated.error.issues }, 'Narration script failed validation, using fallback');
            return generateFallbackNarrationScript(req, risk);
        }

        const result: NarrationScript = {
            objectType: req.objectType,
            objectId: req.objectId,
            objectName: req.objectName,
            script: validated.data.script,
            generatedAt: new Date().toISOString(),
        };

        log.info({ objectType: req.objectType, objectId: req.objectId, len: result.script.length }, 'Narration script generated via LLM');
        return result;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error({ err: msg }, 'Claude narration failed, using fallback');
        return generateFallbackNarrationScript(req, risk);
    }
}
