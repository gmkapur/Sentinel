# Implementation Plan: Object Click Narration

**PRD:** `docs/PRD_OBJECT_NARRATION.md`  
**Date:** 2026-04-11  
**Build order:** shared types → agent → gateway → frontend (each step compiles independently before the next begins)

---

## Overview of changes

| Package | Files touched | Net new files |
|---------|--------------|---------------|
| `packages/shared` | `src/types.ts` | — |
| `packages/agent` | `src/router.ts` | `src/narrationBrief.ts` |
| `packages/gateway` | `src/routes.ts` | — |
| `packages/frontend` | `src/services/api.ts`, `src/stores/missionStore.ts`, `src/components/sentinel/hud/AgentRing.tsx`, `src/components/sentinel/hud/AgentPixelHud.tsx`, `src/components/sentinel/GlobeCommandView.tsx`, `src/components/satellite/SatelliteDetailPanel.tsx` | `src/hooks/useObjectNarration.ts` |
| `.env` / `.env.example` | Add `ELEVENLABS_VOICE_ID` | — |

---

## Step 1 — Shared types

**File:** `packages/shared/src/types.ts`

Append at the bottom of the file (after the last export):

```ts
// ---------------------------------------------------------------------------
// Narration
// ---------------------------------------------------------------------------

export interface NarrationRequest {
    objectType: 'satellite' | 'threat' | 'neo';
    /** NORAD ID string for satellites, threatType key for threats, NEO id for neos. */
    objectId: string;
    objectName: string;
}

/** Returned by the agent's POST /narrate endpoint. Not streamed to the browser. */
export interface NarrationScript {
    objectType: NarrationRequest['objectType'];
    objectId: string;
    objectName: string;
    /** Plain spoken prose, TTS-optimised. No markdown, no bullets. Max ~400 words. */
    script: string;
    generatedAt: string;
}
```

**Verify:** `cd packages/shared && npx tsc --noEmit` passes.

---

## Step 2 — Agent: narration script generator

**New file:** `packages/agent/src/narrationBrief.ts`

This module is the only place that touches the Anthropic SDK for narration. It mirrors the structure of `llmBrief.ts`.

### 2a. Zod validation schema

```ts
import { z } from 'zod';

export const narrationScriptSchema = z.object({
    script: z.string().min(10).max(2000),
});
```

### 2b. Per-objectType system prompts

Three separate system prompt strings — one per `objectType`. Keep them in a `const` map:

```ts
const SYSTEM_PROMPTS: Record<NarrationRequest['objectType'], string> = {
    satellite: `You are Orbit Sentinel's voice briefing system. ...`,
    threat:    `You are Orbit Sentinel's voice briefing system. ...`,
    neo:       `You are Orbit Sentinel's voice briefing system. ...`,
};
```

**Satellite system prompt (full text to use):**
```
You are Orbit Sentinel's voice briefing system. Generate a spoken narration brief for the satellite identified below.

Rules:
- Open with the satellite name and NORAD ID.
- State orbit regime, altitude, sunlit/shadow status, and SAA status.
- Describe the 2-3 most active threats to this satellite from the space weather context provided.
- Name up to 3 other satellites in similar orbit regimes that share the same threat exposure if available.
- End with 1-2 concrete recommended actions the operator should take now.
- Write as natural spoken prose — no bullet points, no markdown, no parenthetical numbers, no dashes used as list markers.
- Stay under 380 words.
- Do not describe threats as harming people on the ground. Frame everything in terms of satellite operations.
- Return ONLY the plain prose text. No JSON, no code fences, no headers.
```

**Threat system prompt:**
```
You are Orbit Sentinel's voice briefing system. Generate a spoken narration brief for the space weather threat identified below.

Rules:
- Open by naming the threat type and its current severity.
- Describe what this threat means for satellites in the affected orbit regimes.
- Name the top 3 most at-risk satellites from the provided context.
- Describe what the near-term trajectory of this threat looks like (intensifying, stable, decaying).
- End with 1-2 recommended actions for affected operators.
- Write as natural spoken prose — no bullet points, no markdown.
- Stay under 350 words.
- Return ONLY the plain prose text.
```

**NEO system prompt:**
```
You are Orbit Sentinel's voice briefing system. Generate a spoken narration brief for the near-Earth object identified below.

Rules:
- Open by naming the object and its close-approach date.
- State the miss distance in kilometers and relative velocity.
- State whether it is classified as potentially hazardous.
- Describe what relevance, if any, this object has to current satellite operations.
- End with a monitoring recommendation.
- Write as natural spoken prose — no bullet points, no markdown.
- Stay under 280 words.
- Return ONLY the plain prose text.
```

### 2c. Context builder

A single `buildNarrationContext` function that assembles the user-turn message. Takes the request object plus all the data-cache accessors as arguments:

```ts
function buildNarrationContext(
    req: NarrationRequest,
    risk: RiskState | null,
    weather: SpaceWeatherState | null,
    flares: DONKIFlare[],
    cmes: DONKICME[],
    neos: NEOObject[],
    topRisk: SatRiskSummary[],
    conjunctions: ConjunctionEvent[],
): string
```

Build a plain-text block like the existing `buildUserPrompt` in `llmBrief.ts`. For `objectType: 'satellite'` include the conjunction list filtered to that NORAD ID. For `objectType: 'threat'` include `topRisk`. For `objectType: 'neo'` focus on the matching NEO entry from `neos`.

### 2d. Exported generation function

```ts
export async function generateNarrationScript(
    req: NarrationRequest,
    ...dataArgs
): Promise<NarrationScript>
```

Pattern:
1. Call `getClient()` (reuse same lazy-init pattern from `llmBrief.ts`)
2. If no client, call `generateFallbackNarrationScript(req, risk)` (deterministic template — see §2e)
3. Build context string, call `anthropic.messages.create` with `max_tokens: 800`, `system: SYSTEM_PROMPTS[req.objectType]`
4. Extract `.content[0].text`, validate with `narrationScriptSchema.safeParse`
5. On validation failure, fall back
6. Return `NarrationScript` with `generatedAt: new Date().toISOString()`

### 2e. Fallback generator

```ts
export function generateFallbackNarrationScript(
    req: NarrationRequest,
    risk: RiskState | null,
): NarrationScript
```

One template per `objectType`. For satellite: `"This is Orbit Sentinel. Satellite {name}, NORAD {id}, is currently at nominal tracking status. Overall mission risk is {level} at a score of {score} out of 100. No specific advisory data is available at this time. Continue standard monitoring protocols."`. Similar terse templates for threat and NEO.

---

## Step 3 — Agent: POST /narrate route

**File:** `packages/agent/src/router.ts`

### 3a. Import additions (top of file)

```ts
import { generateNarrationScript, generateFallbackNarrationScript } from './narrationBrief';
import type { NarrationRequest } from '@sentinel/shared';
```

### 3b. Zod schema (add near top of file with other inline schemas)

```ts
const narrationRequestSchema = z.object({
    objectType: z.enum(['satellite', 'threat', 'neo']),
    objectId: z.string().min(1),
    objectName: z.string().min(1),
});
```

### 3c. Route handler (add after existing routes, before `export default router`)

```ts
// -------------------------------------------------------------------------
// POST /narrate — generate spoken narration script for a clicked object
// -------------------------------------------------------------------------
router.post('/narrate', async (req, res) => {
    const parsed = narrationRequestSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid narration request' });
        return;
    }
    const narReq: NarrationRequest = parsed.data;

    try {
        const risk       = await getLatestRisk();
        const weather    = getLatestSpaceWeather();
        const flares     = getRecentFlares();
        const cmes       = getRecentCMEs();
        const neos       = getUpcomingNeos();

        // Fetch gateway data needed for satellite/threat context
        const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3001';
        const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';
        let topRisk: SatRiskSummary[] = [];
        let conjunctions: ConjunctionEvent[] = [];

        try {
            const [trRes, cjRes] = await Promise.all([
                axios.get(`${GATEWAY_URL}/internal/top-risk-satellites`, {
                    headers: { 'x-internal-secret': INTERNAL_SECRET },
                    timeout: 3000,
                }),
                axios.get(`${GATEWAY_URL}/internal/active-conjunctions`, {
                    headers: { 'x-internal-secret': INTERNAL_SECRET },
                    timeout: 3000,
                }),
            ]);
            topRisk     = trRes.data.satellites ?? [];
            conjunctions = cjRes.data.conjunctions ?? [];
        } catch {
            // Gateway context is best-effort; proceed without it
        }

        const script = await generateNarrationScript(
            narReq, risk, weather, flares, cmes, neos, topRisk, conjunctions,
        );

        log.info({ objectType: narReq.objectType, objectId: narReq.objectId }, 'Narration script generated');
        res.json(script);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error({ err: msg }, 'Narration script generation failed');
        // Deterministic fallback — always returns something
        const fallback = generateFallbackNarrationScript(narReq, null);
        res.json(fallback);
    }
});
```

**Note:** `axios` is already imported in `router.ts` via other usages. If not, add `import axios from 'axios'` at top.

**Verify:** `cd packages/agent && npx tsc --noEmit` passes.

---

## Step 4 — Gateway: POST /api/v1/narrate

**File:** `packages/gateway/src/routes.ts`

### 4a. Import additions

```ts
import type { NarrationRequest } from '@sentinel/shared';
```

### 4b. Zod schema (add near top with other inline schemas)

```ts
const narrationRequestBodySchema = z.object({
    objectType: z.enum(['satellite', 'threat', 'neo']),
    objectId: z.string().min(1),
    objectName: z.string().min(1),
});
```

### 4c. Route constant (module-level, outside `createRouter`)

```ts
/** Minimum ms between narration requests — protects ElevenLabs character limits. */
const NARRATION_COOLDOWN_MS = 1500;
let lastNarrationAt = 0;
```

### 4d. Route handler (add inside `createRouter`, after the `POST /api/v1/agent/orbit-suggestion` handler)

```ts
// -----------------------------------------------------------------------
// POST /api/v1/narrate — generate + stream TTS for a clicked globe object
// -----------------------------------------------------------------------
router.post('/api/v1/narrate', async (req: Request, res: Response) => {
    // --- Cooldown check ---
    const now = Date.now();
    if (now - lastNarrationAt < NARRATION_COOLDOWN_MS) {
        res.status(429).json({ error: 'Too many narration requests — wait a moment' });
        return;
    }

    // --- Body validation ---
    const parsed = narrationRequestBodySchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ error: 'Invalid request body' });
        return;
    }
    const narReq: NarrationRequest = parsed.data;

    // --- Env check ---
    const elevenLabsKey   = process.env.ELEVENLABS_API_KEY;
    const elevenLabsVoice = process.env.ELEVENLABS_VOICE_ID;
    if (!elevenLabsKey || !elevenLabsVoice) {
        // Return the script as JSON so the frontend can display text fallback
        try {
            const scriptRes = await axios.post(`${AGENT_URL}/narrate`, narReq, { timeout: 30_000 });
            res.status(503).json({
                error: 'TTS not configured',
                script: scriptRes.data.script ?? null,
            });
        } catch {
            res.status(503).json({ error: 'TTS not configured', script: null });
        }
        return;
    }

    lastNarrationAt = now;

    try {
        // 1. Get narration script from agent
        const scriptResponse = await axios.post<{ script: string }>(
            `${AGENT_URL}/narrate`,
            narReq,
            { timeout: 30_000 },
        );
        const script = scriptResponse.data.script;
        if (!script || typeof script !== 'string') {
            throw new Error('Agent returned empty script');
        }

        // 2. Stream TTS from ElevenLabs
        const ttsResponse = await axios.post(
            `https://api.elevenlabs.io/v1/text-to-speech/${elevenLabsVoice}/stream`,
            {
                text: script,
                model_id: 'eleven_turbo_v2_5',
                output_format: 'mp3_44100_128',
            },
            {
                headers: {
                    'xi-api-key': elevenLabsKey,
                    'Content-Type': 'application/json',
                    Accept: 'audio/mpeg',
                },
                responseType: 'stream',
                timeout: 30_000,
            },
        );

        // 3. Pipe audio stream directly to response
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Transfer-Encoding', 'chunked');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('X-Narration-Object-Id', narReq.objectId);
        res.setHeader('X-Narration-Object-Type', narReq.objectType);

        (ttsResponse.data as NodeJS.ReadableStream).pipe(res);

        (ttsResponse.data as NodeJS.ReadableStream).on('error', (err: Error) => {
            routeLog.error({ err: err.message }, 'ElevenLabs stream error mid-pipe');
            if (!res.headersSent) {
                res.status(502).json({ error: 'TTS stream error' });
            } else {
                res.end();
            }
        });

    } catch (err: unknown) {
        const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
        const message = axiosErr.response?.data?.detail ?? axiosErr.message ?? 'Unknown error';
        routeLog.error({ err: message }, 'Narration pipeline failed');
        if (!res.headersSent) {
            res.status(502).json({ error: `Narration failed: ${message}` });
        }
    }
});
```

**Verify:** `cd packages/gateway && npx tsc --noEmit` passes.

---

## Step 5 — Frontend: mission store additions

**File:** `packages/frontend/src/stores/missionStore.ts`

### 5a. Add to `MissionStore` interface (alongside `agentSpeaking`)

```ts
/** NORAD ID / threatType / neo ID of the object currently being narrated. Null when silent. */
activeNarrationId: string | null;
```

### 5b. Add to initial state object

```ts
activeNarrationId: null,
```

### 5c. Add action to the store's `set` calls (after `agentSpeaking` setter pattern)

```ts
setActiveNarrationId: (id: string | null) =>
    set({ activeNarrationId: id }),
```

---

## Step 6 — Frontend: api.ts helper

**File:** `packages/frontend/src/services/api.ts`

Add import at top:

```ts
import type { NarrationRequest } from '@sentinel/shared/src/types';
```

Add to the `api` object after `postOrbitSuggestion`:

```ts
/** Returns a fetch Response whose body is a streaming audio/mpeg. Caller must handle abort. */
narrate: (req: NarrationRequest, signal?: AbortSignal): Promise<Response> => {
    return fetch('/api/v1/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
        signal,
    });
},
```

Return type is `Promise<Response>` (not `fetchJson`) because the body is a binary audio stream, not JSON.

---

## Step 7 — Frontend: useObjectNarration hook

**New file:** `packages/frontend/src/hooks/useObjectNarration.ts`

Full implementation:

```ts
import { useRef, useState, useCallback, useEffect } from 'react';
import { useMissionStore } from '../stores/missionStore';
import { api } from '../services/api';
import type { NarrationRequest } from '@sentinel/shared/src/types';

export interface UseObjectNarrationReturn {
    narrate: (req: NarrationRequest) => void;
    cancel: () => void;
    isNarrating: boolean;
    /** Normalised RMS amplitude 0–1 sampled at ~30 fps from Web Audio AnalyserNode. */
    amplitude: number;
}

export function useObjectNarration(): UseObjectNarrationReturn {
    const [isNarrating, setIsNarrating] = useState(false);
    const [amplitude, setAmplitude]     = useState(0);

    const abortRef      = useRef<AbortController | null>(null);
    const audioCtxRef   = useRef<AudioContext | null>(null);
    const analyserRef   = useRef<AnalyserNode | null>(null);
    const rafRef        = useRef<number>(0);
    const sourceRef     = useRef<AudioBufferSourceNode | null>(null);

    const setAgentSpeaking     = useMissionStore((s) => s.setAgentSpeaking);        // existing action
    const setActiveNarrationId = useMissionStore((s) => s.setActiveNarrationId);    // new action from §5

    // -----------------------------------------------------------------------
    // Internal cleanup — stops audio, cancels fetch, resets state
    // -----------------------------------------------------------------------
    const cleanup = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        sourceRef.current?.stop();
        sourceRef.current?.disconnect();
        sourceRef.current = null;
        analyserRef.current?.disconnect();
        analyserRef.current = null;
        abortRef.current?.abort();
        abortRef.current = null;
        setIsNarrating(false);
        setAmplitude(0);
        setAgentSpeaking(false);
        setActiveNarrationId(null);
    }, [setAgentSpeaking, setActiveNarrationId]);

    // cleanup on unmount
    useEffect(() => cleanup, [cleanup]);

    // -----------------------------------------------------------------------
    // Amplitude polling loop — reads AnalyserNode at ~30 fps
    // -----------------------------------------------------------------------
    const startAmplitudePoll = useCallback((analyser: AnalyserNode) => {
        const buf = new Uint8Array(analyser.fftSize);
        const tick = () => {
            analyser.getByteTimeDomainData(buf);
            // RMS of time-domain samples (0–255 centred at 128)
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
                const s = (buf[i] - 128) / 128;
                sum += s * s;
            }
            const rms = Math.sqrt(sum / buf.length);
            setAmplitude(Math.min(rms * 4, 1)); // scale: typical speech RMS ~0.05–0.25
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, []);

    // -----------------------------------------------------------------------
    // Main narrate function — called from click handlers
    // -----------------------------------------------------------------------
    const narrate = useCallback(async (req: NarrationRequest) => {
        // Cancel any in-flight narration first
        cleanup();

        // Lazily create AudioContext on first user gesture
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new AudioContext();
        }
        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === 'suspended') {
            await audioCtx.resume();
        }

        const abortCtrl = new AbortController();
        abortRef.current = abortCtrl;

        setIsNarrating(true);
        setAgentSpeaking(true);
        setActiveNarrationId(req.objectId);

        try {
            const response = await api.narrate(req, abortCtrl.signal);

            if (!response.ok) {
                // 503 means TTS unconfigured — gateway may return script as JSON
                const json = await response.json().catch(() => ({})) as { script?: string };
                if (json.script) {
                    // Surface text in HUD via agentSpeechTarget (existing mechanism)
                    useMissionStore.getState().setAgentSpeechTarget?.(json.script);
                }
                cleanup();
                return;
            }

            // Read the audio/mpeg stream as ArrayBuffer chunks
            const reader = response.body!.getReader();
            const chunks: Uint8Array[] = [];
            let done = false;

            while (!done) {
                const { value, done: streamDone } = await reader.read();
                if (streamDone) { done = true; break; }
                if (value) chunks.push(value);
            }

            if (abortCtrl.signal.aborted) return;

            // Concatenate all chunks and decode
            const totalLen = chunks.reduce((n, c) => n + c.byteLength, 0);
            const combined = new Uint8Array(totalLen);
            let offset = 0;
            for (const chunk of chunks) {
                combined.set(chunk, offset);
                offset += chunk.byteLength;
            }

            const audioBuffer = await audioCtx.decodeAudioData(combined.buffer);
            if (abortCtrl.signal.aborted) return;

            // Wire: source → analyser → destination
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyserRef.current = analyser;

            const source = audioCtx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(analyser);
            analyser.connect(audioCtx.destination);
            sourceRef.current = source;

            startAmplitudePoll(analyser);

            source.onended = () => { cleanup(); };
            source.start(0);

        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('[useObjectNarration] error:', err);
            }
            cleanup();
        }
    }, [cleanup, setAgentSpeaking, setActiveNarrationId, startAmplitudePoll]);

    return { narrate, cancel: cleanup, isNarrating, amplitude };
}
```

**Implementation note on streaming vs full-buffer:** The approach above collects the full MP3 before decoding. This trades ~1–2 s of extra latency for implementation simplicity — `decodeAudioData` requires a complete ArrayBuffer. A true streaming approach (MediaSource API) is more complex and adds ~80 lines for negligible perceptible difference given typical script lengths. Revisit in v2 if latency becomes a concern.

---

## Step 8 — Frontend: AgentRing amplitude ref

**File:** `packages/frontend/src/components/sentinel/hud/AgentRing.tsx`

### 8a. Props type change (line 11 area)

```ts
// before
type Props = {
    status: AgentRingStatus;
};

// after
type Props = {
    status: AgentRingStatus;
    /** Optional ref written by parent at ~30fps. Animation loop reads directly — no re-render cost. */
    amplitudeRef?: React.MutableRefObject<number>;
};
```

### 8b. Destructure in component (line 24)

```ts
// before
export default function AgentRing({ status }: Props) {

// after
export default function AgentRing({ status, amplitudeRef }: Props) {
```

### 8c. Intensity computation (inside `animate`, around line 233–234)

```ts
// before
const intensity =
    st === 'SPEAKING' ? 0.26 : st === 'ALERT' ? 0.2 : 0.075;

// after
const amp = amplitudeRef ? Math.min(amplitudeRef.current, 1) : 0;
const intensity =
    st === 'SPEAKING'
        ? 0.26 + amp * 0.38          // 0.26 at silence → 0.64 at peak speech
        : st === 'ALERT' ? 0.2 : 0.075;
```

### 8d. Z-axis vibration (inside the per-particle loop, around lines 251–256)

```ts
// before
if (st === 'SPEAKING') {
    z +=
        Math.sin(t * 16 + i * 0.06) * 0.055
        + Math.sin(t * 24 + angle * 4) * 0.03;
}

// after
if (st === 'SPEAKING') {
    const vib = 0.04 + amp * 0.06;
    z += Math.sin(t * 16 + i * 0.06) * vib
       + Math.sin(t * 24 + angle * 4) * vib * 0.55;
}
```

### 8e. Material opacity while SPEAKING (around line 277)

```ts
// before
material.opacity = 0.42 + (Math.sin(t * 8.5) * 0.5 + 0.5) * 0.52;

// after
material.opacity = 0.42 + (Math.sin(t * 8.5) * 0.5 + 0.5) * 0.32 + amp * 0.28;
```

### 8f. Ripple scale (inside the `rippleMeshes.forEach`, around line 317)

```ts
// before
mesh.scale.setScalar(1 + Math.sin(phase * 1.3) * (st === 'SPEAKING' ? 0.04 : 0.018));

// after
mesh.scale.setScalar(
    1 + Math.sin(phase * 1.3) * (st === 'SPEAKING' ? 0.04 + amp * 0.06 : 0.018),
);
```

**Backwards compatibility:** When `amplitudeRef` is not provided, `amp` is always 0 and behaviour is identical to current. The existing `SPEAKING` animation still runs.

---

## Step 9 — Frontend: AgentPixelHud — pass amplitudeRef to AgentRing

**File:** `packages/frontend/src/components/sentinel/hud/AgentPixelHud.tsx`

### 9a. Props type change

```ts
// before (no props)
export function AgentPixelHud() {

// after
interface AgentPixelHudProps {
    amplitudeRef?: React.MutableRefObject<number>;
}
export function AgentPixelHud({ amplitudeRef }: AgentPixelHudProps = {}) {
```

### 9b. Pass through to AgentRing (wherever `<AgentRing status={...} />` appears in the JSX)

```tsx
// before
<AgentRing status={agentStatus} />

// after
<AgentRing status={agentStatus} amplitudeRef={amplitudeRef} />
```

---

## Step 10 — Frontend: GlobeCommandView — wire narration to clicks

**File:** `packages/frontend/src/components/sentinel/GlobeCommandView.tsx`

### 10a. Import additions

```ts
import { useRef, useEffect } from 'react'; // useRef may already be imported
import { useObjectNarration } from '../../hooks/useObjectNarration';
```

### 10b. Hook instantiation (inside `GlobeCommandView`, after existing hooks)

```ts
const { narrate, cancel, isNarrating, amplitude } = useObjectNarration();

// Stable ref for AgentRing — updated each render without triggering re-render of Three.js loop
const amplitudeRef = useRef(0);
useEffect(() => {
    amplitudeRef.current = amplitude;
});
```

### 10c. Satellite click handler

Find the existing satellite click handler (currently sets `selectedAsset`, zooms to satellite). Add the narration call inside it:

```ts
// Add inside the existing satellite-click callback, after the existing logic:
narrate({ objectType: 'satellite', objectId: String(sat.id), objectName: sat.name });
```

### 10d. Threat click handler

Find where threat triangles are clicked (currently sets `focusedWeatherEventId` or similar). If a click handler already exists, add narration to it. If none exists yet, add:

```ts
const handleThreatClick = useCallback((threat: ThreatTriangle) => {
    narrate({ objectType: 'threat', objectId: threat.threatType ?? threat.id, objectName: threat.name });
}, [narrate]);
```

Then pass `handleThreatClick` to `GlobeView` (see §10e).

### 10e. Pass amplitudeRef and handleThreatClick into child components

```tsx
// Pass amplitudeRef to AgentPixelHud:
<AgentPixelHud amplitudeRef={amplitudeRef} />

// Pass handleThreatClick to GlobeView (if GlobeView doesn't already accept an onThreatClick prop,
// add it in GlobeView's Props type and wire it to the threat marker onClick):
<GlobeView
    ref={globeRef}
    ...existingProps...
    onThreatClick={handleThreatClick}
/>
```

**GlobeView prop addition** (if needed): In `packages/frontend/src/components/globe/GlobeView.tsx`, add `onThreatClick?: (threat: ThreatTriangle) => void` to the `Props` type and call it from the existing threat-marker HTML/Three.js click handler.

---

## Step 11 — Frontend: SatelliteDetailPanel — speaker button

**File:** `packages/frontend/src/components/satellite/SatelliteDetailPanel.tsx`

### 11a. Props type change

```ts
// before
interface Props {
    satellite: SatPosition;
    onClose: () => void;
}

// after
interface Props {
    satellite: SatPosition;
    onClose: () => void;
    onNarrate?: (objectId: string, objectName: string) => void;
    isNarrating?: boolean;
}
```

### 11b. Import additions

```ts
import { Volume2, VolumeX } from 'lucide-react'; // add to existing lucide import line
```

### 11c. Speaker button (in the header row, after the Star button and before the X button)

```tsx
{onNarrate && (
    <button
        onClick={() =>
            isNarrating
                ? onNarrate('', '')   // empty string signals cancel to parent
                : onNarrate(String(satellite.id), satellite.name)
        }
        className={`transition-colors p-0.5 ${isNarrating ? 'text-accent animate-pulse' : 'text-text-muted hover:text-accent'}`}
        title={isNarrating ? 'Stop narration' : 'Narrate this satellite'}
    >
        {isNarrating
            ? <VolumeX size={14} />
            : <Volume2 size={14} />
        }
    </button>
)}
```

### 11d. Wire from GlobeCommandView

In `GlobeCommandView`, pass `onNarrate` and `isNarrating` to the `SatelliteDetailPanel` instance:

```tsx
<SatelliteDetailPanel
    satellite={selectedSatellite}
    onClose={handleClosePanel}
    onNarrate={(id, name) => {
        if (!id) { cancel(); return; }
        narrate({ objectType: 'satellite', objectId: id, objectName: name });
    }}
    isNarrating={isNarrating && activeNarrationId === String(selectedSatellite.id)}
/>
```

Where `activeNarrationId` is read from the mission store: `const activeNarrationId = useMissionStore((s) => s.activeNarrationId)`.

---

## Step 12 — Environment variables

**File:** `.env` (and `.env.example` if it exists)

Add:
```env
# ElevenLabs TTS — used by narration feature (POST /api/v1/narrate)
# ELEVENLABS_API_KEY already set above for outbound calls — reused here
ELEVENLABS_VOICE_ID=EXAVITQu4vr4xnSDxMaL
```

**CLAUDE.md** — add `ELEVENLABS_VOICE_ID` to the env vars section in the "Things That Will Bite You" area so future devs know about it.

---

## Build order checklist

Work through these in sequence. Each step should compile before moving to the next.

- [ ] **Step 1** — Add `NarrationRequest` + `NarrationScript` to `packages/shared/src/types.ts`
- [ ] **Step 2** — Create `packages/agent/src/narrationBrief.ts`
- [ ] **Step 3** — Add `POST /narrate` to `packages/agent/src/router.ts`
- [ ] **Step 4** — Add `POST /api/v1/narrate` to `packages/gateway/src/routes.ts`
- [ ] **Step 5** — Add `activeNarrationId` + `setActiveNarrationId` to mission store
- [ ] **Step 6** — Add `api.narrate()` to `packages/frontend/src/services/api.ts`
- [ ] **Step 7** — Create `packages/frontend/src/hooks/useObjectNarration.ts`
- [ ] **Step 8** — Update `AgentRing.tsx` with `amplitudeRef` prop and amplitude-driven animation
- [ ] **Step 9** — Update `AgentPixelHud.tsx` to accept + forward `amplitudeRef`
- [ ] **Step 10** — Update `GlobeCommandView.tsx` to wire clicks to narration
- [ ] **Step 11** — Update `SatelliteDetailPanel.tsx` with speaker button
- [ ] **Step 12** — Add `ELEVENLABS_VOICE_ID` to `.env` and `.env.example`

---

## Integration test sequence (manual)

Run `npm run dev` in gateway and agent (with valid `.env`), then `npm run dev` in frontend.

1. Open the globe. Click a satellite point. Confirm:
   - AgentRing transitions to `SPEAKING` state
   - Audio plays within ~3 s of click
   - AgentRing particles visibly pulse with speech amplitude
   - `SatelliteDetailPanel` speaker icon shows pulsing/VolumeX while audio plays
2. While audio plays, click a different satellite. Confirm first audio stops immediately and new audio starts.
3. Click the VolumeX icon in the panel. Confirm audio stops and ring returns to `IDLE`.
4. Click a threat-triangle marker. Confirm audio plays with a threat-focused narration.
5. Test with `ELEVENLABS_API_KEY` unset. Confirm: endpoint returns 503 with `script` field, no audio plays, no unhandled console errors, ring stays `IDLE`.
6. Test with `ANTHROPIC_API_KEY` unset. Confirm: fallback script is used, TTS still plays the fallback text.

---

## Known edge cases to watch

- **`AudioContext` suspended state:** Chrome suspends `AudioContext` created outside a gesture. The hook calls `audioCtx.resume()` before starting — this must happen inside the click callback path, not in a `useEffect`. If `narrate()` is ever called programmatically (not from a click), audio will silently fail. This is intentional — narration is an interactive feature.
- **Long scripts:** ElevenLabs `eleven_turbo_v2_5` has a 5000-character request limit. The Zod schema on the agent caps scripts at 2000 chars. This is well within limits.
- **Concurrent `GlobeView` clicks and panel button clicks:** Both call the same `narrate()` via `GlobeCommandView`. The `cleanup()` at the top of `narrate()` ensures only one audio session is ever active.
- **Mobile / Safari:** `AudioContext` requires `webkit` prefix on older Safari. If Safari support is needed, use the `standardized-audio-context` ponyfill. Out of scope for v1.
