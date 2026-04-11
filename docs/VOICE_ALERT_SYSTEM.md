# Voice Alert System

| Field | Value |
|-------|-------|
| **Type** | Product Requirements Document (PRD) |
| **Status** | Design Complete |
| **Feature** | Agentic ElevenLabs + Twilio phone call alerts |
| **Service** | Agent (`:3002`) |
| **Trigger** | Risk level transitions to `HIGH` or `CRITICAL` |
| **Dependencies** | ElevenLabs API, Twilio phone number |

---

## Overview

When the agent detects a high-risk space weather event, it initiates an outbound phone call via ElevenLabs Conversational AI + Twilio. A voice AI agent calls the operator's phone, delivers a concise spoken mission brief (risk level, primary threat, recommended action), and directs them to the dashboard for full details. The operator can ask follow-up questions conversationally — the ElevenLabs agent has the full risk context injected as its system prompt.

```
Agent risk engine ──► HIGH/CRITICAL transition detected
                         │
                         ▼
              Phone alert module (agent service)
                         │
                         ├─► ElevenLabs Conversational AI API
                         │       POST /v1/convai/twilio/outbound-call
                         │       agent_id + phone_number_id + to_number
                         │
                         └─► Twilio places outbound call
                                 │
                                 ▼
                         Operator's phone rings
                         AI agent delivers brief
                         Operator can ask questions
                         "Check the dashboard for full details"
```

---

## Architecture

The voice alert system lives **inside the existing agent service** (`:3002`) as a new module — not a separate microservice. It hooks into the existing `evaluate()` -> `pushToGateway()` pipeline.

### New Files

```
packages/agent/src/
  ├── phoneAlert.ts        # Alert orchestrator (cooldown, dedup, trigger logic)
  ├── elevenLabsClient.ts  # ElevenLabs outbound call API wrapper
  └── alertConfig.ts       # Phone numbers, preferences, cooldown settings
```

### Data Flow

```
riskEngine.evaluate()
    │
    ▼
phoneAlert.shouldCall(riskState, previousState)
    │
    ├── NO  → skip (cooldown active, level not high enough, already called)
    │
    └── YES → elevenLabsClient.initiateCall({
                agentId,              // pre-configured ElevenLabs agent
                phoneNumberId,        // Twilio number registered in ElevenLabs
                toNumber,             // operator's phone
                conversationContext   // injected risk state as first_message + prompt
              })
                │
                └── POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call
                        │
                        ▼
                    ElevenLabs orchestrates Twilio call
                    AI agent speaks to operator
                    Call logged to alertHistory
```

---

## ElevenLabs Agent Configuration

A dedicated Conversational AI agent is created in the ElevenLabs dashboard (one-time setup, not via API).

### System Prompt

```
You are Orbit Sentinel, an autonomous space weather risk analyst. You are calling
a satellite operator to alert them about a detected threat. Be concise, professional,
and calm — like a mission control officer delivering a briefing.

Structure your opening message as:
1. Identify yourself: "This is Orbit Sentinel, your automated mission risk system."
2. State the risk level and score
3. Name the primary threat in one sentence
4. State the recommended action
5. Direct them to the dashboard: "Full details and maneuver windows are available
   on your Orbit Sentinel dashboard."

If the operator asks follow-up questions, answer from the context provided.
Keep answers under 30 seconds of spoken audio. If you don't have specific data,
say "That detail is available on your dashboard" rather than guessing.

Do not discuss topics unrelated to the current space weather alert.
```

### Settings

| Setting | Value |
|---------|-------|
| Voice | `Rachel` (or any clear, professional voice) |
| Model | ElevenLabs default Conversational AI |
| First message | Dynamically injected per call via `conversation_initiation_client_data` |
| Language | English |
| Max call duration | 3 minutes |
| TTS output format | u-law 8kHz (required for telephony) |

---

## API Integration

### ElevenLabs Outbound Call

**Endpoint:** `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call`

**Headers:**
```
xi-api-key: {ELEVENLABS_API_KEY}
Content-Type: application/json
```

**Request:**
```json
{
  "agent_id": "your_agent_id",
  "agent_phone_number_id": "your_phone_number_id",
  "to_number": "+15551234567",
  "conversation_initiation_client_data": {
    "dynamic_variables": {
      "risk_level": "CRITICAL",
      "risk_score": "82",
      "primary_threat": "X2.1 solar flare with earth-directed CME, estimated arrival in 14 hours",
      "recommendation": "NO-GO",
      "action": "Initiate drag-compensation maneuver for LEO assets within 6 hours",
      "dashboard_url": "https://orbit-sentinel.app/dashboard"
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Call initiated",
  "conversation_id": "conv_abc123",
  "callSid": "CA_twilio_sid"
}
```

**First message template** (configured in ElevenLabs dashboard):

```
This is Orbit Sentinel, your automated mission risk system. We are currently at
{{risk_level}} threat level, risk score {{risk_score}} out of 100. {{primary_threat}}.
Our recommendation is {{recommendation}}: {{action}}.
Full details and maneuver windows are available on your dashboard. Do you have any questions?
```

### Twilio Setup (Prerequisite)

Twilio number must be imported into ElevenLabs dashboard under **Phone Numbers -> Import Twilio Number**. ElevenLabs auto-configures webhooks — no TwiML code needed.

**Required:** A purchased Twilio phone number with voice capability, Account SID + Auth Token (entered in ElevenLabs dashboard).

---

## Alert Orchestration

### Configuration

```typescript
interface PhoneAlertConfig {
  enabled: boolean;
  operatorPhones: string[];       // E.164 format: ["+15551234567"]
  cooldownMinutes: number;        // minimum time between calls (default: 30)
  triggerLevels: RiskLevel[];     // which levels trigger calls (default: ['HIGH', 'CRITICAL'])
  escalationEnabled: boolean;     // call again if level worsens during cooldown
  maxCallsPerHour: number;        // hard cap (default: 4)
}
```

### Trigger Rules

| Condition | Action |
|-----------|--------|
| Level transitions to `HIGH` | Call if cooldown expired |
| Level transitions to `CRITICAL` | Call immediately (bypasses cooldown) |
| Level escalates `HIGH -> CRITICAL` during cooldown | Call again (escalation override) |
| Level stays `HIGH`/`CRITICAL` across evaluations | No call (already alerted) |
| Level de-escalates | No call (improvement) |
| Max calls/hour reached | Skip, log warning |

### Cooldown State

```typescript
interface CallState {
  lastCallTime: number;
  lastCallLevel: RiskLevel;
  callsThisHour: number;
  hourStart: number;
  activeConversationId: string | null;
}
```

### Decision Function

```typescript
function shouldCall(
  current: RiskState,
  previous: RiskState | null,
  callState: CallState,
  config: PhoneAlertConfig
): { call: boolean; reason: string } {
  if (!config.enabled) return { call: false, reason: 'disabled' };
  if (!config.triggerLevels.includes(current.level))
    return { call: false, reason: 'level below threshold' };

  // Level didn't change — already alerted
  if (previous && current.level === previous.level)
    return { call: false, reason: 'level unchanged' };

  // De-escalation — no call
  const levelOrder = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
  if (previous && levelOrder[current.level] < levelOrder[previous.level])
    return { call: false, reason: 'de-escalation' };

  // Rate limit
  const now = Date.now();
  if (now - callState.hourStart > 3600000) {
    callState.callsThisHour = 0;
    callState.hourStart = now;
  }
  if (callState.callsThisHour >= config.maxCallsPerHour)
    return { call: false, reason: 'rate limit' };

  // CRITICAL bypasses cooldown
  if (current.level === 'CRITICAL')
    return { call: true, reason: 'critical escalation' };

  // Cooldown check for HIGH
  const cooldownMs = config.cooldownMinutes * 60 * 1000;
  if (now - callState.lastCallTime < cooldownMs)
    return { call: false, reason: 'cooldown active' };

  return { call: true, reason: 'threshold crossed' };
}
```

---

## Integration Point

Hooks into `runEvaluation()` in `packages/agent/src/index.ts`:

```typescript
const { riskState, levelChanged, scoreDelta } = evaluate();

// ... existing brief generation ...

// Phone alert check
if (levelChanged) {
  const callDecision = phoneAlert.shouldCall(riskState, previousRiskState, callState, alertConfig);
  if (callDecision.call) {
    const brief = getLatestBrief() || buildFallbackBrief(riskState);
    await phoneAlert.initiateCall(riskState, brief);
  }
}

await pushToGateway(riskState, brief);
```

---

## New API Endpoints

### Agent (`:3002`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/alerts/call-history` | GET | Call log: timestamps, risk levels, conversation IDs |
| `/alerts/test-call` | POST | Test call with current risk state (dev/staging only) |

### Gateway (`:3001`)

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/agent/call-history` | GET | Proxied to agent `/alerts/call-history` |

---

## Frontend Changes

**AlertPanel:** Add "Call History" section showing timestamp, risk level, call duration, and conversation ID for each outbound call.

**RiskBanner:** Add pulsing phone icon when a call is active or was recently placed.

---

## Environment Variables

```env
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_conversational_agent_id
ELEVENLABS_PHONE_NUMBER_ID=your_imported_twilio_number_id
ALERT_PHONE_NUMBERS=+15551234567,+15559876543
ALERT_COOLDOWN_MINUTES=30
ALERT_ENABLED=true
DASHBOARD_URL=https://orbit-sentinel.app
```

---

## Cost Estimate

| Service | Cost |
|---------|------|
| ElevenLabs | Free tier: 10k chars/month. Scale: ~$99/mo for production volume. |
| Twilio | ~$1.15/mo per number + ~$0.014/min outbound |
| **MVP testing** | Under $5/month |

---

## Example Call Transcript

```
[Phone rings]

AI: "This is Orbit Sentinel, your automated mission risk system. We are currently
    at CRITICAL threat level, risk score 82 out of 100. An X2.1 solar flare with
    an earth-directed coronal mass ejection has been detected, with estimated arrival
    in 14 hours. Our recommendation is NO-GO: initiate drag-compensation maneuver
    for LEO assets within 6 hours. Full details and maneuver windows are available
    on your Orbit Sentinel dashboard. Do you have any questions?"

Operator: "Which satellites are most at risk?"

AI: "Based on current orbital data, your LEO satellites on the sunlit side —
    particularly those below 600 kilometers altitude — face the highest radiation
    exposure during the CME arrival window. Specific satellite-level risk breakdowns
    and recommended maneuver sequences are available on your dashboard."

Operator: "Got it, thanks."

AI: "Understood. Stay safe. Orbit Sentinel will continue monitoring and will
    alert you if conditions change. Goodbye."

[Call ends]
```

---

## Setup Checklist

1. Create ElevenLabs account and get API key
2. Create Conversational AI agent with the system prompt above
3. Configure first message template with `{{dynamic_variables}}` placeholders
4. Buy a Twilio phone number with voice capability
5. Import Twilio number into ElevenLabs (Phone Numbers -> Import)
6. Note `agent_id` and `agent_phone_number_id` from ElevenLabs dashboard
7. Add environment variables to `.env`
8. Set `ALERT_ENABLED=true`
9. Test with `POST :3002/alerts/test-call`
