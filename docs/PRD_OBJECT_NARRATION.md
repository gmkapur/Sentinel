# PRD: Object Click Narration with ElevenLabs Voice Streaming

**Status:** Draft  
**Date:** 2026-04-11  
**Feature area:** Globe interaction → Agent narration → Voice streaming → HUD animation

---

## Overview

When a user clicks any tracked object on the 3D globe (satellite, threat marker, NEO, conjunction node), Sentinel speaks a live AI-generated audio briefing about that object. The briefing covers what the object is, active threats against it, other affected entities in its orbit regime, and recommended near-term plans. While the audio plays, the AgentRing canvas responds to the real-time audio amplitude — particles expand and contract with the speech signal rather than using the static `SPEAKING` sine-wave pattern.

---

## User Story

> As a mission planner, when I click a satellite or threat on the globe I want Orbit Sentinel to immediately speak a concise briefing about that object — its current risk posture, what's threatening it, who else is affected, and what I should do next — so I can get situational awareness without reading a panel.

---

## Scope

**In scope:**
- Clickable object types: `SatPosition` satellite points, threat-triangle markers, NEO markers (future: EONET event markers)
- LLM summary generation on the agent service using Claude (`claude-sonnet-4-6`)
- ElevenLabs text-to-speech streaming (TTS HTTP streaming API, not the Twilio outbound-call API)
- Streaming audio from gateway → browser using chunked HTTP or a short-lived WebSocket sub-channel
- Web Audio API `AnalyserNode` wired to the AgentRing so particle amplitude tracks real audio energy
- Debounce / cancel: clicking a second object while audio is playing immediately stops the current stream and starts the new one

**Out of scope (future work):**
- Click narration for EONET surface events (data model not yet object-typed for narration)
- Persistent narration history / transcripts
- User-selectable voice
- Multi-language support

---

## Data Model

### New shared type: `NarrationRequest`

Located in `packages/shared/src/types.ts`:

```ts
export interface NarrationRequest {
  objectType: 'satellite' | 'threat' | 'neo';
  objectId: string;       // NORAD ID (satellite), threatType key (threat), NEO id (neo)
  objectName: string;
}
```

### New shared type: `NarrationScript` (internal, not streamed)

Used between agent and gateway before TTS:

```ts
export interface NarrationScript {
  objectType: NarrationRequest['objectType'];
  objectId: string;
  objectName: string;
  script: string;         // Plain prose, TTS-optimised (no markdown, no bullets)
  generatedAt: string;
}
```

The `script` field is what gets sent to ElevenLabs. Max ~400 words (~90 seconds of speech at natural pace).

---

## Backend Architecture

### 1. New agent endpoint — `POST /narrate`

**File:** `packages/agent/src/router.ts`

Accepts a `NarrationRequest`, pulls live context from `dataCache`, calls Claude to generate a `NarrationScript`, then returns the script as JSON.

**Prompt context injected into Claude:**

| Source | Data pulled |
|--------|-------------|
| `getLatestRisk()` | Overall risk score + breakdown |
| `getLatestSpaceWeather()` | Kp, flares, proton flux, BZ, solar wind |
| `getRecentFlares()` | Last 3 flares with class + time |
| `getRecentCMEs()` | Last 2 CMEs with speed |
| `getUpcomingNeos()` | Closest NEO within 7 days |
| Gateway `/internal/top-risk-satellites` | Top 5 satellites by risk (for context when object is a threat) |
| Gateway `/internal/active-conjunctions` | Conjunctions involving the satellite (when objectType=satellite) |

**System prompt structure (satellite example):**

```
You are Orbit Sentinel's voice briefing system. Generate a spoken narration brief
for the satellite identified below. The brief MUST:
- Open with the satellite name and NORAD ID
- State its current orbit regime, altitude, sunlit/shadow, SAA status
- Describe the top 2-3 active threats to this satellite from the space weather context
- Name up to 3 other satellites in similar orbit regimes that share the same threat exposure
- End with 1-2 concrete recommended actions the operator should take now
- Be written as natural spoken prose — no bullet points, no markdown, no parenthetical numbers
- Be under 380 words total
```

**Response validation:** Zod schema on the `script` string (non-empty, max 2000 chars).

**Fallback:** If `ANTHROPIC_API_KEY` is absent or Claude errors, return a deterministic template brief (same pattern as `generateFallbackBrief` in `llmBrief.ts`).

---

### 2. New gateway endpoint — `POST /api/v1/narrate` (streaming)

**File:** `packages/gateway/src/routes.ts`

This endpoint is the single surface the frontend calls. It orchestrates the full narration pipeline:

```
POST /api/v1/narrate
Content-Type: application/json
{ objectType, objectId, objectName }
```

**Response:** `Content-Type: audio/mpeg` with `Transfer-Encoding: chunked`

**Pipeline inside the handler:**

1. Validate body with Zod (`NarrationRequest` shape)
2. `POST {AGENT_URL}/narrate` → receive `NarrationScript` (JSON, ≤5 s timeout for script generation; total budget 30 s)
3. Call ElevenLabs TTS streaming API:
   ```
   POST https://api.elevenlabs.io/v1/text-to-speech/{ELEVENLABS_VOICE_ID}/stream
   xi-api-key: {ELEVENLABS_API_KEY}
   { text: script.script, model_id: "eleven_turbo_v2_5", output_format: "mp3_44100_128" }
   ```
4. Pipe the ElevenLabs response stream directly to the HTTP response — no buffering, first audio byte reaches the browser in <1 s after ElevenLabs starts responding
5. On any upstream error, send HTTP 502 with `{ error: "..." }` before the stream starts (or abort mid-stream)

**Auth:** Public route, same `x-api-key` check as other `/api/v1/` routes (bypassed in development).

**Env vars added:**

| Var | Description |
|-----|-------------|
| `ELEVENLABS_VOICE_ID` | Voice ID for TTS (e.g. `EXAVITQu4vr4xnSDxMaL` — "Rachel") |
| `ELEVENLABS_API_KEY` | Already exists for outbound call; reused here |

If `ELEVENLABS_API_KEY` or `ELEVENLABS_VOICE_ID` are missing, the endpoint returns `{ error: "TTS not configured" }` with HTTP 503. The frontend falls back to showing the script text only (no audio).

---

## Frontend Architecture

### 1. New hook — `useObjectNarration`

**File:** `packages/frontend/src/hooks/useObjectNarration.ts`

```ts
interface UseObjectNarrationReturn {
  narrate: (req: NarrationRequest) => void;
  cancel: () => void;
  isNarrating: boolean;
  amplitude: number;   // 0.0–1.0, updated ~30fps from AnalyserNode
}
```

Internally:

1. `fetch('/api/v1/narrate', { method: 'POST', body: JSON.stringify(req) })` — the response body is an audio stream
2. Pipe the response `ReadableStream` through the Web Audio API:
   - `AudioContext.createMediaStreamSource` / `createBufferSource` from streamed MP3 chunks decoded via `AudioContext.decodeAudioData` as chunks arrive
   - `AnalyserNode` sits between source and destination; `getByteTimeDomainData` sampled at ~30fps to produce `amplitude`
3. On `cancel()` or new `narrate()` call: abort the fetch, stop/disconnect existing audio nodes, reset amplitude to 0
4. Sets `useMissionStore.agentSpeaking = true` on play start, `false` on end/cancel

**Browser audio note:** `AudioContext` must be created/resumed inside a user-gesture handler (the click). The hook constructs it lazily on first `narrate()` call.

---

### 2. AgentRing animation — amplitude-driven particles

**File:** `packages/frontend/src/components/sentinel/hud/AgentRing.tsx`

**Current behaviour:** `SPEAKING` status uses a fixed `intensity = 0.26` and pre-baked sine modulation.

**New behaviour:** Accept an additional `amplitude` prop (`number`, 0–1). When `status === 'SPEAKING'`, the warp intensity becomes:

```ts
const intensity = st === 'SPEAKING'
  ? 0.26 + amplitude * 0.38      // 0.26 at silence → 0.64 at peak speech
  : st === 'ALERT' ? 0.2 : 0.075;
```

Z-axis vibration in the per-particle loop also scales with amplitude:

```ts
// before (static):
z += Math.sin(t * 16 + i * 0.06) * 0.055 + Math.sin(t * 24 + angle * 4) * 0.03;

// after (amplitude-driven):
const vib = 0.04 + amplitude * 0.06;
z += Math.sin(t * 16 + i * 0.06) * vib + Math.sin(t * 24 + angle * 4) * vib * 0.55;
```

Material opacity:

```ts
// before:
material.opacity = 0.42 + (Math.sin(t * 8.5) * 0.5 + 0.5) * 0.52;

// after:
material.opacity = 0.42 + (Math.sin(t * 8.5) * 0.5 + 0.5) * 0.32 + amplitude * 0.28;
```

Ripple scale:

```ts
// before:
mesh.scale.setScalar(1 + Math.sin(phase * 1.3) * 0.04);

// after:
mesh.scale.setScalar(1 + Math.sin(phase * 1.3) * (0.04 + amplitude * 0.06));
```

The `amplitude` ref is updated from outside the animation loop using a `useImperativeHandle` or a ref callback so the Three.js loop reads the latest value without React re-renders. Specifically: add `amplitudeRef = useRef(0)` in `AgentRing`, expose a `setAmplitude(v: number)` via `useImperativeHandle`, and call it from `AgentPixelHud` (which receives `amplitude` from `useObjectNarration`).

**Props change:**

```ts
// before
type Props = { status: AgentRingStatus }

// after
type Props = { status: AgentRingStatus; amplitudeRef?: React.MutableRefObject<number> }
```

Pass an `amplitudeRef` from the parent. The animation loop reads `amplitudeRef.current` directly — no prop diff, no re-render.

---

### 3. GlobeCommandView — wiring clicks to narration

**File:** `packages/frontend/src/components/sentinel/GlobeCommandView.tsx`

```ts
const { narrate, cancel, isNarrating, amplitude } = useObjectNarration();
const amplitudeRef = useRef(0);

// keep ref in sync for AgentRing
useEffect(() => { amplitudeRef.current = amplitude; }, [amplitude]);

// satellite click (already handled by GlobeView onSatelliteClick):
const handleSatelliteClick = useCallback((sat: SatPosition) => {
  // existing: open SatelliteDetailPanel, zoom to satellite
  // new:
  narrate({ objectType: 'satellite', objectId: String(sat.id), objectName: sat.name });
}, [narrate]);

// threat marker click (new):
const handleThreatClick = useCallback((threat: ThreatTriangle) => {
  narrate({ objectType: 'threat', objectId: threat.threatType, objectName: threat.name });
}, [narrate]);
```

Pass `amplitudeRef` down to `AgentPixelHud` → `AgentRing`.

---

### 4. SatelliteDetailPanel — narrate button

**File:** `packages/frontend/src/components/satellite/SatelliteDetailPanel.tsx`

Add a speaker icon button in the panel header (next to the Star and X buttons). On click: calls `narrate(...)` via a prop or context. The button shows a pulsing state while `isNarrating && currentObjectId === satellite.id`, and shows a stop icon to cancel.

```tsx
<button onClick={() => isNarrating ? cancel() : narrate({...})} ...>
  {isNarrating ? <VolumeX size={14} /> : <Volume2 size={14} />}
</button>
```

---

## Error States

| Scenario | Behaviour |
|----------|-----------|
| `ANTHROPIC_API_KEY` missing | Agent returns fallback script; TTS still runs |
| `ELEVENLABS_API_KEY` / `VOICE_ID` missing | Gateway returns 503; frontend shows script text in HUD output area, no audio |
| ElevenLabs TTS API error mid-stream | Frontend catches stream abort, sets `isNarrating = false`, shows "Audio unavailable" in HUD for 3 s |
| User clicks second object while audio plays | `cancel()` called first, then new `narrate()` — no queuing |
| Browser blocks autoplay | `AudioContext.resume()` is called inside the click handler, satisfying the user-gesture requirement |

---

## New Environment Variables

```env
# .env additions
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL   # or any valid ElevenLabs voice ID
# ELEVENLABS_API_KEY already exists for outbound call feature
```

---

## API Contract Summary

```
POST /api/v1/narrate
Request:  { objectType: "satellite"|"threat"|"neo", objectId: string, objectName: string }
Response: audio/mpeg stream (chunked)
Errors:   503 { error: "TTS not configured" }
          502 { error: "..." }           (upstream failure before stream starts)
          400 { error: "..." }           (validation)
```

```
POST /narrate   (agent-internal, not exposed outside gateway)
Request:  NarrationRequest
Response: { script: string, objectType, objectId, objectName, generatedAt }
```

---

## Acceptance Criteria

1. Clicking a satellite on the globe triggers an audio briefing within 3 seconds of click
2. The briefing mentions the satellite name, orbit regime, at least one active threat if risk > LOW, and at least one recommended action
3. The AgentRing particles visibly respond to speech amplitude — amplitude variation of ≥ 0.3 produces a noticeably different ring expansion vs silence
4. Clicking a second satellite while the first is speaking immediately stops the first audio and begins the second
5. Clicking the speaker icon in `SatelliteDetailPanel` triggers narration identically to a globe click
6. If `ELEVENLABS_API_KEY` is not set, the system still shows the text script in the HUD and does not throw an unhandled error
7. No audio plays without a user gesture (no autoplay violations in Chrome/Firefox)
8. The existing `SPEAKING` ring animation (not amplitude-driven) still works correctly when `agentSpeaking` is true but no `amplitudeRef` is provided (backwards-compatible default)

---

## Open Questions

1. **Voice selection:** Default to a fixed voice ID in `.env`. Should there be a UI picker in settings? (Deferred.)
2. **Script text display:** Should the narration script also be typed out in the HUD output area as the audio plays (karaoke-style)? This requires word-timing data from ElevenLabs (`alignment` field) — adds complexity. Recommend deferring to v2.
3. **NEO narration context:** NEOs don't have NORAD IDs or orbit regimes. The prompt for `objectType: 'neo'` needs a different template. Should this be in-scope for v1? Recommend yes — the data is available from `getUpcomingNeos()`.
4. **Rate limiting:** ElevenLabs TTS has per-minute character limits on lower tiers. Should the gateway debounce rapid successive clicks (e.g. 1-second minimum between narration requests per session)? Recommend yes — add a 1.5 s cooldown in the gateway handler.
