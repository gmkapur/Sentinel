import type { RiskLevel } from '@sentinel/shared';

// ---------------------------------------------------------------------------
// Phone alert configuration
// ---------------------------------------------------------------------------

export interface PhoneAlertConfig {
    enabled: boolean;
    operatorPhones: string[]; // E.164 format: ["+15551234567"]
    cooldownMinutes: number;
    triggerLevels: RiskLevel[];
    escalationEnabled: boolean;
    maxCallsPerHour: number;
}

export interface CallState {
    lastCallTime: number;
    lastCallLevel: RiskLevel | null;
    callsThisHour: number;
    hourStart: number;
    activeConversationId: string | null;
}

export interface CallHistoryEntry {
    timestamp: string;
    riskLevel: RiskLevel;
    score: number;
    conversationId: string | null;
    callSid: string | null;
    toNumber: string;
    reason: string;
    success: boolean;
}

// ---------------------------------------------------------------------------
// Module-level state (in-memory, resets on restart)
// ---------------------------------------------------------------------------

const callState: CallState = {
    lastCallTime: 0,
    lastCallLevel: null,
    callsThisHour: 0,
    hourStart: Date.now(),
    activeConversationId: null,
};

const callHistory: CallHistoryEntry[] = [];

// ---------------------------------------------------------------------------
// Config loader
// ---------------------------------------------------------------------------

export function loadAlertConfig(): PhoneAlertConfig {
    const phonesRaw = process.env.ALERT_PHONE_NUMBERS || '';
    const operatorPhones = phonesRaw
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

    return {
        enabled: process.env.ALERT_ENABLED === 'true',
        operatorPhones,
        cooldownMinutes: parseInt(
            process.env.ALERT_COOLDOWN_MINUTES || '30',
            10,
        ),
        triggerLevels: ['HIGH', 'CRITICAL'],
        escalationEnabled: true,
        maxCallsPerHour: 4,
    };
}

// ---------------------------------------------------------------------------
// State accessors
// ---------------------------------------------------------------------------

export function getCallState(): CallState {
    return callState;
}

export function updateCallState(updates: Partial<CallState>): void {
    Object.assign(callState, updates);
}

export function getCallHistory(): CallHistoryEntry[] {
    return [...callHistory];
}

export function addCallHistoryEntry(entry: CallHistoryEntry): void {
    callHistory.push(entry);
    // Keep last 100 entries
    if (callHistory.length > 100) {
        callHistory.splice(0, callHistory.length - 100);
    }
}
