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
    const [amplitude, setAmplitude] = useState(0);

    const abortRef    = useRef<AbortController | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const rafRef      = useRef<number>(0);
    const sourceRef   = useRef<AudioBufferSourceNode | null>(null);

    const setAgentSpeaking     = useMissionStore((s) => s.setAgentSpeaking);
    const setActiveNarrationId = useMissionStore((s) => s.setActiveNarrationId);

    // -----------------------------------------------------------------------
    // Internal cleanup — stops audio, cancels fetch, resets state
    // -----------------------------------------------------------------------
    const cleanup = useCallback(() => {
        cancelAnimationFrame(rafRef.current);
        try { sourceRef.current?.stop(); } catch { /* already stopped */ }
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
            // RMS of time-domain samples (0–255, centred at 128)
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
                // 503 means TTS unconfigured — gateway returns script as JSON fallback
                const json = await response.json().catch(() => ({})) as { script?: string };
                if (json.script) {
                    useMissionStore.getState().beginAgentSpeech(json.script);
                }
                cleanup();
                return;
            }

            // Collect the full audio/mpeg stream into an ArrayBuffer
            const reader = response.body!.getReader();
            const chunks: Uint8Array[] = [];

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (value) chunks.push(value);
                // Bail out if cancelled mid-stream
                if (abortCtrl.signal.aborted) return;
            }

            if (abortCtrl.signal.aborted) return;

            // Concatenate chunks
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
                console.error('[useObjectNarration]', err);
            }
            cleanup();
        }
    }, [cleanup, setAgentSpeaking, setActiveNarrationId, startAmplitudePoll]);

    return { narrate, cancel: cleanup, isNarrating, amplitude };
}
