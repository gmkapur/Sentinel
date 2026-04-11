import axios from 'axios';

import type { AgentPushPayload } from '@sentinel/shared';

import { logger } from './logger';

const log = logger.child({ component: 'Push' });

export async function pushToGateway(payload: AgentPushPayload): Promise<void> {
    const gatewayUrl = process.env.GATEWAY_URL || 'http://localhost:3001';

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        const secret = process.env.INTERNAL_SECRET;
        if (secret) {
            headers['x-internal-secret'] = secret;
        }

        await axios.post(`${gatewayUrl}/internal/agent-push`, payload, {
            headers,
            timeout: 5_000,
        });
        log.info({ gatewayUrl, score: payload.risk.score, level: payload.risk.level }, 'Payload delivered to gateway');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error({ err: msg, gatewayUrl }, 'Failed to deliver payload to gateway');
        // Fire-and-forget -- next evaluation cycle will retry
    }
}
