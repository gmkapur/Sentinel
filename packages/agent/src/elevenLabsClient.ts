import axios from 'axios';
import type { RiskState, MissionBrief } from '@sentinel/shared';

// ---------------------------------------------------------------------------
// ElevenLabs Conversational AI — outbound call via Twilio
// ---------------------------------------------------------------------------

interface OutboundCallParams {
    riskState: RiskState;
    brief: MissionBrief;
    toNumber: string;
}

interface OutboundCallResult {
    conversationId: string;
    callSid: string;
}

export async function initiateOutboundCall(
    params: OutboundCallParams,
): Promise<OutboundCallResult | null> {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    const agentId = process.env.ELEVENLABS_AGENT_ID;
    const phoneNumberId = process.env.ELEVENLABS_PHONE_NUMBER_ID;
    const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:5173';

    if (!apiKey || !agentId || !phoneNumberId) {
        console.warn(
            '[PhoneAlert] Missing ElevenLabs env vars (ELEVENLABS_API_KEY, ELEVENLABS_AGENT_ID, ELEVENLABS_PHONE_NUMBER_ID)',
        );
        return null;
    }

    const primaryThreat = params.brief.threats[0] ?? `Risk score elevated to ${params.riskState.score}/100`;
    const action = params.brief.maneuverWindows[0] ?? 'Monitor dashboard for maneuver recommendations';

    try {
        const response = await axios.post(
            'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
            {
                agent_id: agentId,
                agent_phone_number_id: phoneNumberId,
                to_number: params.toNumber,
                conversation_initiation_client_data: {
                    dynamic_variables: {
                        risk_level: params.riskState.level,
                        risk_score: String(params.riskState.score),
                        primary_threat: primaryThreat,
                        recommendation: params.brief.recommendation,
                        action,
                        dashboard_url: dashboardUrl,
                    },
                },
            },
            {
                headers: {
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                timeout: 15_000,
            },
        );

        console.log(
            `[PhoneAlert] Call initiated to ${params.toNumber} — conversation: ${response.data.conversation_id}`,
        );

        return {
            conversationId: response.data.conversation_id,
            callSid: response.data.callSid,
        };
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`[PhoneAlert] Failed to initiate call to ${params.toNumber}: ${msg}`);
        return null;
    }
}
