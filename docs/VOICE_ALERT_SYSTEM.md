# Orbit Sentinel — Voice Alert System PRD

**Feature:** Agentic ElevenLabs + Twilio phone call alerts
**Dependency:** Agent service (`:3002`) risk engine
**Trigger:** Risk level transitions to `HIGH` or `CRITICAL`

---

## 1. Overview

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

## 2. Architecture

The voice alert system lives **inside the existing agent service** (`:3002`) as a new module — not a separate microservice. It hooks into the existing `evaluate()` → `pushToGateway()` pipeline.

### New files in `packages/agent/src/`

```
packages/agent/src/
  ├── phoneAlert.ts        # Alert orchestrator (cooldown, dedup, trigger logic)
  ├── elevenLabsClient.ts  # ElevenLabs outbound call API wrapper
  └── alertConfig.ts       # Phone numbers, preferences, cooldown settings
```

### Data flow

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

## 3. ElevenLabs Agent Configuration

A dedicated ElevenLabs Conversational AI agent is created in the ElevenLabs dashboard (not via API — one-time setup). This agent handles all Orbit Sentinel alert calls.

### Agent system prompt (configured in ElevenLabs dashboard)

```
You are Orbit Sentinel, an autonomous space weather risk analyst. You are calling
a satellite operator to alert them about a detected threat. Be concise, professional,
and calm — like a mission control officer delivering a briefing.

Structure your opening message as:
1. Identify yourself: "This is Orbit Sentinel, your automated mission risk system."
2. State the risk level and score
3. Name the primary threat in one sentence
4. State the recommended action
5. Direct them to the dashboard: "Full details and maneuver windows are available on your Orbit Sentinel dashboard."

If the operator asks follow-up questions, answer from the context provided.
Keep answers under 30 seconds of spoken audio. If you don't have specific data,
say "That detail is available on your dashboard" rather than guessing.

Do not discuss topics unrelated to the current space weather alert.
```

### Agent settings

| Setting | Value |
|---------|-------|
| Voice | `Rachel` (or any clear, professional ElevenLabs voice) |
| Model | ElevenLabs default Conversational AI model |
| First message | Dynamically injected per call via `conversation_initiation_client_data` |
| Language | English |
| Max call duration | 3 minutes |
| TTS output format | μ-law 8kHz (required for telephony) |

---

## 4. API Integration

### 4a. ElevenLabs outbound call API

**Endpoint:** `POST https://api.elevenlabs.io/v1/convai/twilio/outbound-call`

**Headers:**
```
xi-api-key: {ELEVENLABS_API_KEY}
Content-Type: application/json
```

**Request body:**
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

**The `dynamic_variables` are injected into the agent's first message template** configured in the ElevenLabs dashboard:

```
This is Orbit Sentinel, your automated mission risk system. We are currently at
{{risk_level}} threat level, risk score {{risk_score}} out of 100. {{primary_threat}}.
Our recommendation is {{recommendation}}: {{action}}.
Full details and maneuver windows are available on your dashboard. Do you have any questions?
```

### 4b. Twilio setup (prerequisite)

Twilio number must be imported into ElevenLabs dashboard under **Phone Numbers → Import Twilio Number**. ElevenLabs auto-configures webhooks. No TwiML code needed.

**Required Twilio config:**
- A purchased Twilio phone number with voice capability
- Account SID + Auth Token (entered in ElevenLabs dashboard)

---

## 5. Alert Orchestration Logic

### `packages/agent/src/phoneAlert.ts`

```ts
interface PhoneAlertConfig {
  enabled: boolean;
  operatorPhones: string[];       // E.164 format: ["+15551234567"]
  cooldownMinutes: number;        // minimum time between calls (default: 30)
  triggerLevels: RiskLevel[];     // which levels trigger calls (default: ['HIGH', 'CRITICAL'])
  escalationEnabled: boolean;     // call again if level worsens during cooldown
  maxCallsPerHour: number;        // hard cap (default: 4)
}
```

### Trigger rules

| Condition | Action |
|-----------|--------|
| Level transitions to `HIGH` | Call if cooldown expired |
| Level transitions to `CRITICAL` | Call immediately (bypasses cooldown) |
| Level escalates `HIGH → CRITICAL` during cooldown | Call again (escalation override) |
| Level stays `HIGH` or `CRITICAL` across evaluations | No call (already alerted) |
| Level de-escalates `CRITICAL → HIGH → MODERATE` | No call (improvement) |
| Max calls/hour reached | Skip, log warning |

### Cooldown state

```ts
interface CallState {
  lastCallTime: number;
  lastCallLevel: RiskLevel;
  callsThisHour: number;
  hourStart: number;
  activeConversationId: string | null;
}
```

### Decision function

```ts
function shouldCall(
  current: RiskState,
  previous: RiskState | null,
  callState: CallState,
  config: PhoneAlertConfig
): { call: boolean; reason: string } {
  if (!config.enabled) return { call: false, reason: 'disabled' };
  if (!config.triggerLevels.includes(current.level)) return { call: false, reason: 'level below threshold' };

  // Level didn't change — already alerted
  if (previous && current.level === previous.level) return { call: false, reason: 'level unchanged' };

  // De-escalation — no call
  const levelOrder = { LOW: 0, MODERATE: 1, HIGH: 2, CRITICAL: 3 };
  if (previous && levelOrder[current.level] < levelOrder[previous.level]) {
    return { call: false, reason: 'de-escalation' };
  }

  // Rate limit
  const now = Date.now();
  if (now - callState.hourStart > 3600000) {
    callState.callsThisHour = 0;
    callState.hourStart = now;
  }
  if (callState.callsThisHour >= config.maxCallsPerHour) {
    return { call: false, reason: 'rate limit' };
  }

  // CRITICAL bypasses cooldown
  if (current.level === 'CRITICAL') return { call: true, reason: 'critical escalation' };

  // Cooldown check for HIGH
  const cooldownMs = config.cooldownMinutes * 60 * 1000;
  if (now - callState.lastCallTime < cooldownMs) {
    return { call: false, reason: 'cooldown active' };
  }

  return { call: true, reason: 'threshold crossed' };
}
```

---

## 6. Integration Point in Agent

The phone alert hooks into the existing `runEvaluation()` function in `packages/agent/src/index.ts`:

```ts
// Inside runEvaluation(), after risk scoring and brief generation:
const { riskState, levelChanged, scoreDelta } = evaluate();

// ... existing brief generation logic ...

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

## 7. ElevenLabs Client

### `packages/agent/src/elevenLabsClient.ts`

```ts
async function initiateOutboundCall(params: {
  riskState: RiskState;
  brief: MissionBrief;
  toNumber: string;
}): Promise<{ conversationId: string; callSid: string } | null> {
  const primaryThreat = params.brief.threats[0];
  const action = params.brief.maneuver_windows[0];

  const response = await axios.post(
    'https://api.elevenlabs.io/v1/convai/twilio/outbound-call',
    {
      agent_id: process.env.ELEVENLABS_AGENT_ID,
      agent_phone_number_id: process.env.ELEVENLABS_PHONE_NUMBER_ID,
      to_number: params.toNumber,
      conversation_initiation_client_data: {
        dynamic_variables: {
          risk_level: params.riskState.level,
          risk_score: String(params.riskState.score),
          primary_threat: primaryThreat
            ? `${primaryThreat.type.replace('_', ' ')}: ${primaryThreat.detail}`
            : `Risk score elevated to ${params.riskState.score}/100`,
          recommendation: params.brief.recommendation,
          action: action?.action || 'Monitor dashboard for maneuver recommendations',
          dashboard_url: process.env.DASHBOARD_URL || 'https://orbit-sentinel.app',
        },
      },
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );

  return {
    conversationId: response.data.conversation_id,
    callSid: response.data.callSid,
  };
}
```

---

## 8. New Environment Variables

```env
# Voice alerts
ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_AGENT_ID=your_conversational_agent_id
ELEVENLABS_PHONE_NUMBER_ID=your_imported_twilio_number_id
ALERT_PHONE_NUMBERS=+15551234567,+15559876543
ALERT_COOLDOWN_MINUTES=30
ALERT_ENABLED=true
DASHBOARD_URL=https://orbit-sentinel.app

# Twilio (configured via ElevenLabs dashboard, not in code)
# TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are entered in ElevenLabs UI
```

---

## 9. New Agent Router Endpoints

Two new routes on the agent's Express router:

| Route | Method | Purpose |
|-------|--------|---------|
| `/alerts/call-history` | GET | Returns call log: timestamps, risk levels, conversation IDs, durations |
| `/alerts/test-call` | POST | Triggers a test call with current risk state (dev/staging only) |

---

## 10. Gateway + Frontend Changes

### Gateway

Add proxy route: `GET /api/agent/call-history` → proxies to agent `:3002/alerts/call-history`

### Frontend — AlertPanel additions

Add a "Call history" section below alert history showing:
- Timestamp of each outbound call
- Risk level that triggered it
- Call duration (if available from ElevenLabs callback)
- Conversation ID (links to ElevenLabs dashboard for transcript)

Add a visual indicator in the `RiskBanner` when a phone call is active or was recently placed (pulsing phone icon).

---

## 11. Required API Keys & Accounts

| Service | Cost | Setup |
|---------|------|-------|
| **ElevenLabs** | Free tier: 10k chars/month. Scale plan ~$99/mo for production call volume. | Sign up → create Conversational AI agent → import Twilio number |
| **Twilio** | ~$1.15/mo per phone number + ~$0.014/min outbound calls | Sign up → buy a number → note Account SID + Auth Token |

**Total cost for MVP testing:** Under $5/month (a few test calls on Twilio + ElevenLabs free tier).

---

## 12. Example Call Transcript

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

## 13. One-Time Setup Checklist

1. Create ElevenLabs account, get API key
2. Create a Conversational AI agent in ElevenLabs dashboard with the system prompt from Section 3
3. Configure the first message template with `{{dynamic_variables}}` placeholders
4. Buy a Twilio phone number with voice capability
5. Import the Twilio number into ElevenLabs (Phone Numbers → Import → enter SID + Auth Token)
6. Note the `agent_id` and `agent_phone_number_id` from ElevenLabs dashboard
7. Add env vars to `.env`
8. Set `ALERT_ENABLED=true`
9. Test with `POST :3002/alerts/test-call`
