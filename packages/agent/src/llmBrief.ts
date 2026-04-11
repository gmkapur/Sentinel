import Anthropic from '@anthropic-ai/sdk';

import axios from 'axios';

import type {
    RiskState,
    SpaceWeatherState,
    MissionBrief,
    DONKIFlare,
    DONKICME,
    NEOObject,
    SatRiskSummary,
    ConjunctionEvent,
    FlarePathPrediction,
} from '@sentinel/shared';

import { logger } from './logger';
import { saveMissionBrief } from './dataCache';

const log = logger.child({ component: 'LLM' });

// ---------------------------------------------------------------------------
// Client initialization -- reads ANTHROPIC_API_KEY from env automatically
// ---------------------------------------------------------------------------

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!client) {
        client = new Anthropic();
    }
    return client;
}

const MODEL = 'claude-sonnet-4-20250514';

// ---------------------------------------------------------------------------
// Trigger logic
// ---------------------------------------------------------------------------

export function shouldGenerateBrief(
    currentRisk: RiskState,
    previousRisk: RiskState | null,
    lastBriefAt: Date | null,
): boolean {
    // No API key -> always use fallback
    if (!process.env.ANTHROPIC_API_KEY) return false;

    // No previous assessment -> generate first brief
    if (!previousRisk) return true;

    // Risk level changed
    if (currentRisk.level !== previousRisk.level) return true;

    // Score delta >= 15
    if (Math.abs(currentRisk.score - previousRisk.score) >= 15) return true;

    // 30-minute heartbeat
    if (!lastBriefAt) return true;
    const thirtyMinMs = 30 * 60 * 1000;
    if (Date.now() - lastBriefAt.getTime() >= thirtyMinMs) return true;

    return false;
}

// ---------------------------------------------------------------------------
// LLM brief generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a senior space weather analyst for satellite mission operations at a space situational awareness center. Given the current space weather data and risk assessment, generate a structured mission brief for satellite operators.

Your analysis should consider:
- Compound threats: simultaneous M5+ flares with Kp >= 5 indicate CME-driven storm confirmation
- Kp >= 7 with high proton flux means severe radiation plus atmospheric drag risk for LEO assets
- Solar wind speed > 700 km/s combined with southward Bz (< -10 nT) amplifies geomagnetic disturbance
- Potentially hazardous asteroids within 7 days warrant monitoring advisories
- When per-satellite risk data is provided, include actionable guidance for the most at-risk assets (e.g., "ISS should delay EVA operations", "LEO CubeSats on sunlit side should enter safe mode during this flare window")
- TLE-based conjunction warnings are proximity alerts, NOT collision predictions. SGP4 accuracy degrades to ~1 km over days. For WARNING/CRITICAL conjunctions, recommend monitoring or standby for avoidance maneuvers — do NOT declare imminent collision
- Conjunctions during geomagnetic storms (Kp >= 5) are higher uncertainty due to atmospheric drag perturbations on LEO orbits

Respond ONLY with valid JSON matching this exact schema (no markdown, no code fences):
{
  "recommendation": "GO" | "CAUTION" | "NO-GO",
  "summary": "1-2 sentence plain-language assessment of current conditions",
  "threats": ["specific threat description 1", "specific threat description 2"],
  "maneuverWindows": ["actionable recommendation 1", "actionable recommendation 2"],
  "confidence": 0.0 to 1.0
}`;

export async function generateBrief(
    risk: RiskState,
    weather: SpaceWeatherState,
    flares: DONKIFlare[],
    cmes: DONKICME[],
    neos: NEOObject[],
): Promise<MissionBrief> {
    const anthropic = getClient();

    // If no client available, fall back to deterministic
    if (!anthropic) {
        return generateFallbackBrief(risk);
    }

    try {
        const userPrompt = await buildUserPrompt(
            risk,
            weather,
            flares,
            cmes,
            neos,
        );

        const response = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            messages: [{ role: 'user', content: userPrompt }],
        });

        const textBlock = response.content.find(
            (block) => block.type === 'text',
        );
        if (!textBlock || textBlock.type !== 'text') {
            throw new Error('No text content in Claude response');
        }

        const parsed = JSON.parse(textBlock.text) as {
            recommendation: string;
            summary: string;
            threats: string[];
            maneuverWindows: string[];
            confidence: number;
        };

        const brief: MissionBrief = {
            recommendation: validateRecommendation(parsed.recommendation),
            summary: String(parsed.summary ?? ''),
            threats: Array.isArray(parsed.threats)
                ? parsed.threats.map(String)
                : [],
            maneuverWindows: Array.isArray(parsed.maneuverWindows)
                ? parsed.maneuverWindows.map(String)
                : [],
            confidence: Math.max(
                0,
                Math.min(1, Number(parsed.confidence) || 0.5),
            ),
            generatedAt: new Date().toISOString(),
            isLlm: true,
        };

        await saveMissionBrief(brief);
        log.info({ recommendation: brief.recommendation, confidence: brief.confidence, isLlm: true }, 'LLM brief generated');
        return brief;
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error({ err: msg }, 'Claude API failed, using fallback');
        return generateFallbackBrief(risk);
    }
}

// ---------------------------------------------------------------------------
// Deterministic fallback
// ---------------------------------------------------------------------------

export function generateFallbackBrief(risk: RiskState): MissionBrief {
    let recommendation: MissionBrief['recommendation'];
    let summary: string;
    const threats: string[] = [];

    switch (risk.level) {
        case 'LOW':
            recommendation = 'GO';
            summary =
                'All space weather parameters are within nominal ranges. No significant threats detected.';
            break;
        case 'MODERATE':
            recommendation = 'CAUTION';
            summary = `Elevated space weather activity detected with a risk score of ${risk.score}. Monitor conditions closely before committing to operations.`;
            if (risk.breakdown.flare > 0)
                threats.push(
                    `Solar flare activity contributing ${risk.breakdown.flare} risk points`,
                );
            if (risk.breakdown.geomagnetic > 0)
                threats.push(
                    `Geomagnetic disturbance contributing ${risk.breakdown.geomagnetic} risk points`,
                );
            if (risk.breakdown.radiation > 0)
                threats.push(
                    `Elevated proton flux contributing ${risk.breakdown.radiation} risk points`,
                );
            break;
        case 'HIGH':
            recommendation = 'NO-GO';
            summary = `Significant space weather threats detected with a risk score of ${risk.score}. Postpone non-essential operations.`;
            if (risk.breakdown.flare >= 25)
                threats.push(
                    'Strong solar flare activity (M5+ class or higher)',
                );
            if (risk.breakdown.geomagnetic >= 15)
                threats.push('Geomagnetic storm conditions (Kp ≥ 5)');
            if (risk.breakdown.radiation >= 15)
                threats.push('Elevated radiation storm conditions (≥10 pfu)');
            if (risk.breakdown.compound > 0)
                threats.push(
                    'Compound threat synergy detected — multiple concurrent hazards',
                );
            break;
        case 'CRITICAL':
            recommendation = 'NO-GO';
            summary = `CRITICAL space weather conditions with a risk score of ${risk.score}. All non-essential satellite operations should be suspended immediately.`;
            threats.push('Severe compound space weather event in progress');
            if (risk.breakdown.flare >= 40)
                threats.push('X-class solar flare active');
            if (risk.breakdown.geomagnetic >= 30)
                threats.push('Severe geomagnetic storm (Kp ≥ 7, G3+)');
            if (risk.breakdown.radiation >= 25)
                threats.push('Severe radiation storm (proton flux ≥ 100 pfu)');
            break;
    }

    const brief: MissionBrief = {
        recommendation,
        summary,
        threats,
        maneuverWindows:
            risk.level === 'LOW'
                ? ['All operational windows are clear']
                : ['Defer non-essential maneuvers until conditions improve'],
        confidence: risk.level === 'LOW' ? 0.9 : 0.7,
        generatedAt: new Date().toISOString(),
        isLlm: false,
    };

    log.info({ recommendation: brief.recommendation, isLlm: false }, 'Fallback brief generated');
    return brief;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateRecommendation(rec: string): MissionBrief['recommendation'] {
    const upper = String(rec).toUpperCase();
    if (upper === 'GO' || upper === 'CAUTION' || upper === 'NO-GO') {
        return upper as MissionBrief['recommendation'];
    }
    return 'CAUTION';
}

async function fetchTopRiskSatellites(): Promise<SatRiskSummary[]> {
    try {
        const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001';
        const res = await axios.get(
            `${gatewayUrl}/internal/top-risk-satellites`,
            {
                timeout: 5_000,
            },
        );
        return res.data?.satellites ?? [];
    } catch {
        return [];
    }
}

async function fetchActiveConjunctions(): Promise<ConjunctionEvent[]> {
    try {
        const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001';
        const res = await axios.get(
            `${gatewayUrl}/internal/active-conjunctions`,
            {
                timeout: 5_000,
            },
        );
        return res.data?.conjunctions ?? [];
    } catch {
        return [];
    }
}

async function buildUserPrompt(
    risk: RiskState,
    weather: SpaceWeatherState,
    flares: DONKIFlare[],
    cmes: DONKICME[],
    neos: NEOObject[],
): Promise<string> {
    const [topSats, conjunctions] = await Promise.all([
        fetchTopRiskSatellites(),
        fetchActiveConjunctions(),
    ]);

    let satSection = '';
    if (topSats.length > 0) {
        satSection = '\n\nMOST AT-RISK SATELLITES:\n';
        for (const sat of topSats.slice(0, 10)) {
            satSection += `  ${sat.name} (NORAD ${sat.noradId}, ${sat.orbitRegime}) — ${sat.riskLevel} (score ${sat.riskScore}): ${sat.threats.join(', ')}\n`;
        }
        satSection +=
            '\nInclude satellite-specific guidance in your assessment where relevant.';
    }

    let conjSection = '';
    if (conjunctions.length > 0) {
        conjSection = '\n\nACTIVE CONJUNCTION WARNINGS (TLE-based proximity alerts, NOT collision predictions):\n';
        for (const c of conjunctions.slice(0, 10)) {
            conjSection += `  ${c.sat1Name} ↔ ${c.sat2Name} — ${c.distanceKm.toFixed(1)} km (${c.severity}, ${c.sat1Regime}/${c.sat2Regime})\n`;
        }
        conjSection +=
            '\nNote: TLE accuracy is ~1 km for LEO. Include conjunction-specific guidance for WARNING/CRITICAL events.';
    }

    return `Current Space Weather Assessment — ${new Date().toISOString()}

RISK SCORE: ${risk.score}/100 (${risk.level})
BREAKDOWN:
  Solar Flare:        ${risk.breakdown.flare} points
  Geomagnetic Storm:  ${risk.breakdown.geomagnetic} points
  Radiation Storm:    ${risk.breakdown.radiation} points
  Solar Wind:         ${risk.breakdown.solarWind} points
  IMF Bz:             ${risk.breakdown.imfBz} points
  NEO Proximity:      ${risk.breakdown.neo} points
  Compound Synergy:   ${risk.breakdown.compound} points

CURRENT READINGS:
  X-ray Class: ${weather.xrayClass ?? 'N/A'}
  Kp Index: ${weather.kpIndex ?? 'N/A'}
  Proton Flux: ${weather.protonFlux ?? 'N/A'} pfu
  Solar Wind Speed: ${weather.solarWindSpeed ?? 'N/A'} km/s
  IMF Bz: ${weather.bz ?? 'N/A'} nT

RECENT FLARES (last 30 days): ${
        flares.length > 0
            ? flares
                  .slice(0, 10)
                  .map((f) => `${f.classType} at ${f.peakTime}`)
                  .join('; ')
            : 'None recorded'
    }

RECENT CMEs (last 30 days): ${
        cmes.length > 0
            ? cmes
                  .slice(0, 5)
                  .map(
                      (c) =>
                          `${c.activityID} speed=${c.speed ?? 'unknown'} km/s at ${c.startTime}`,
                  )
                  .join('; ')
            : 'None recorded'
    }

NEAR-EARTH OBJECTS (next 7 days): ${
        neos.length > 0
            ? neos
                  .slice(0, 5)
                  .map(
                      (n) =>
                          `${n.name} (${n.isPotentiallyHazardous ? 'PHA' : 'non-PHA'}, miss=${Math.round(n.missDistanceKm).toLocaleString()} km)`,
                  )
                  .join('; ')
            : 'None tracked'
    }${satSection}${conjSection}

Generate your mission brief.`;
}
