import type { RiskState, RiskLevel, MissionBrief } from '@sentinel/shared';
import { logger } from './logger';
import { initiateOutboundCall } from './elevenLabsClient';
import { generateFallbackBrief } from './llmBrief';
import {
    loadAlertConfig,
    getCallState,
    updateCallState,
    addCallHistoryEntry,
    type PhoneAlertConfig,
    type CallState,
} from './alertConfig';

const log = logger.child({ component: 'PhoneAlert' });

// ---------------------------------------------------------------------------
// Decision logic -- should we place a call?
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<RiskLevel, number> = {
    LOW: 0,
    MODERATE: 1,
    HIGH: 2,
    CRITICAL: 3,
};

export function shouldCall(
    current: RiskState,
    previous: RiskState | null,
    callState: CallState,
    config: PhoneAlertConfig,
): { call: boolean; reason: string } {
    if (!config.enabled) {
        return { call: false, reason: 'disabled' };
    }

    if (config.operatorPhones.length === 0) {
        return { call: false, reason: 'no operator phones configured' };
    }

    if (!config.triggerLevels.includes(current.level)) {
        return { call: false, reason: 'level below threshold' };
    }

    // Level didn't change -- already alerted
    if (previous && current.level === previous.level) {
        return { call: false, reason: 'level unchanged' };
    }

    // De-escalation -- no call
    if (previous && LEVEL_ORDER[current.level] < LEVEL_ORDER[previous.level]) {
        return { call: false, reason: 'de-escalation' };
    }

    // Rate limit
    const now = Date.now();
    if (now - callState.hourStart > 3_600_000) {
        callState.callsThisHour = 0;
        callState.hourStart = now;
    }
    if (callState.callsThisHour >= config.maxCallsPerHour) {
        return { call: false, reason: 'rate limit' };
    }

    // CRITICAL bypasses cooldown
    if (current.level === 'CRITICAL') {
        return { call: true, reason: 'critical escalation' };
    }

    // Cooldown check for HIGH
    const cooldownMs = config.cooldownMinutes * 60 * 1000;
    if (now - callState.lastCallTime < cooldownMs) {
        return { call: false, reason: 'cooldown active' };
    }

    return { call: true, reason: 'threshold crossed' };
}

// ---------------------------------------------------------------------------
// Main entry point -- called from runEvaluationCycle()
// ---------------------------------------------------------------------------

export async function checkAndAlert(
    currentRisk: RiskState,
    previousRisk: RiskState | null,
    brief: MissionBrief | null,
): Promise<void> {
    const config = loadAlertConfig();
    const state = getCallState();

    const decision = shouldCall(currentRisk, previousRisk, state, config);

    if (!decision.call) {
        if (
            config.enabled &&
            config.triggerLevels.includes(currentRisk.level)
        ) {
            log.debug({ reason: decision.reason, riskLevel: currentRisk.level }, 'Phone alert skipped');
        }
        return;
    }

    log.info({ reason: decision.reason, riskLevel: currentRisk.level, score: currentRisk.score }, 'Triggering phone alert calls');

    const useBrief = brief ?? generateFallbackBrief(currentRisk);

    for (const phone of config.operatorPhones) {
        const result = await initiateOutboundCall({
            riskState: currentRisk,
            brief: useBrief,
            toNumber: phone,
        });

        addCallHistoryEntry({
            timestamp: new Date().toISOString(),
            riskLevel: currentRisk.level,
            score: currentRisk.score,
            conversationId: result?.conversationId ?? null,
            callSid: result?.callSid ?? null,
            toNumber: phone,
            reason: decision.reason,
            success: result !== null,
        });

        if (result) {
            updateCallState({
                lastCallTime: Date.now(),
                lastCallLevel: currentRisk.level,
                callsThisHour: state.callsThisHour + 1,
                activeConversationId: result.conversationId,
            });
        }
    }
}
