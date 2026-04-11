import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
    if (!process.env.ANTHROPIC_API_KEY) return null;
    if (!client) client = new Anthropic();
    return client;
}

const MODEL = process.env.ANTHROPIC_ORBIT_MODEL || 'claude-sonnet-4-20250514';

export type OrbitSuggestionInput = {
    satellite: {
        id: string;
        altitudeKm?: number;
        lat?: number;
        lng?: number;
        inclination?: number;
    };
    threat: {
        type: string;
        name: string;
        severity: string;
        assetsAtRisk: number;
        description: string;
        impactHours: number;
    };
    currentOrbit: {
        altitudeKm: number;
        inclination: number;
        lat: number;
        lng: number;
    };
};

export type OrbitSuggestionPayload = {
    recommendation: string;
    maneuver: {
        type: string;
        deltaAltitudeKm: number;
        deltaInclination: number;
        burnDurationSeconds: number;
        thrustDirection: string;
        urgencyHours: number;
    };
    newOrbit: {
        altitudeKm: number;
        inclination: number;
        safetyMarginKm: number;
    };
    costOfManeuver: string;
    riskIfIgnored: string;
};

function stripJsonFence(text: string): string {
    let t = text.trim();
    if (t.startsWith('```')) {
        t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
    }
    return t.trim();
}

function fallbackSuggestion(input: OrbitSuggestionInput): OrbitSuggestionPayload {
    const baseAlt = input.currentOrbit.altitudeKm;
    const raise = Math.min(220, Math.max(40, Math.round(baseAlt * 0.12)));
    return {
        recommendation:
            'Raise perigee with a short prograde burn to increase separation from the active threat corridor while preserving plane. Revisit conjunction screening after maneuver.',
        maneuver: {
            type: 'altitude_raise',
            deltaAltitudeKm: raise,
            deltaInclination: 0,
            burnDurationSeconds: 42,
            thrustDirection: 'prograde',
            urgencyHours: Math.max(2, Math.round(input.threat.impactHours / 6)),
        },
        newOrbit: {
            altitudeKm: baseAlt + raise,
            inclination: input.currentOrbit.inclination,
            safetyMarginKm: 280,
        },
        costOfManeuver: 'MODERATE  ··  ~3% propellant reserve',
        riskIfIgnored: 'Sustained exposure in the corridor elevates charging and SEU risk for avionics.',
    };
}

export async function generateOrbitSuggestion(
    input: OrbitSuggestionInput
): Promise<OrbitSuggestionPayload> {
    const anthropic = getClient();
    if (!anthropic) return fallbackSuggestion(input);

    const { satellite, threat, currentOrbit } = input;
    const userContent = `You are an orbital mechanics advisor for satellite operators.

Satellite: ${satellite.id}
Current altitude: ${currentOrbit.altitudeKm}km
Current position: ${currentOrbit.lat}° lat, ${currentOrbit.lng}° lng
Inclination: ${currentOrbit.inclination}°

Active threat: ${threat.type}
Threat name: ${threat.name}
Threat severity: ${threat.severity}
Assets at risk: ${threat.assetsAtRisk}
Description: ${threat.description}
Time to impact: ${threat.impactHours} hours

Provide a specific orbital adjustment recommendation to move this satellite out of the threat corridor. Respond in this exact JSON format with no other text:

{
  "recommendation": "2-3 sentence plain language explanation of the maneuver",
  "maneuver": {
    "type": "altitude_raise|altitude_lower|inclination_change|phasing",
    "deltaAltitudeKm": <number, positive to raise negative to lower>,
    "deltaInclination": <number in degrees>,
    "burnDurationSeconds": <number>,
    "thrustDirection": "prograde|retrograde|normal|antinormal",
    "urgencyHours": <number, hours until maneuver must begin>
  },
  "newOrbit": {
    "altitudeKm": <new altitude after maneuver>,
    "inclination": <new inclination>,
    "safetyMarginKm": <distance from threat corridor edge>
  },
  "costOfManeuver": "estimated fuel cost description",
  "riskIfIgnored": "one sentence consequence"
}`;

    try {
        const message = await anthropic.messages.create({
            model: MODEL,
            max_tokens: 1024,
            messages: [{ role: 'user', content: userContent }],
        });
        const block = message.content.find((b) => b.type === 'text');
        if (!block || block.type !== 'text') throw new Error('No text in response');
        const raw = stripJsonFence(block.text);
        const parsed = JSON.parse(raw) as OrbitSuggestionPayload;
        if (!parsed.newOrbit || typeof parsed.newOrbit.altitudeKm !== 'number') {
            throw new Error('Invalid suggestion shape');
        }
        return parsed;
    }
    catch {
        return fallbackSuggestion(input);
    }
}
