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
    const synthRef    = useRef<SpeechSynthesisUtterance | null>(null);

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
        if (synthRef.current) {
            window.speechSynthesis?.cancel();
            synthRef.current = null;
        }
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
            let sum = 0;
            for (let i = 0; i < buf.length; i++) {
                const s = (buf[i] - 128) / 128;
                sum += s * s;
            }
            const rms = Math.sqrt(sum / buf.length);
            setAmplitude(Math.min(rms * 4, 1));
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
    }, []);

    // -----------------------------------------------------------------------
    // Phase 2: play audio for the given script (ElevenLabs or browser TTS)
    // -----------------------------------------------------------------------
    const playAudio = useCallback(async (script: string, abortCtrl: AbortController) => {
        // Try ElevenLabs first
        try {
            const audioRes = await api.narrateAudio(script, abortCtrl.signal);

            if (audioRes.ok) {
                // Lazily create / resume AudioContext
                if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                    audioCtxRef.current = new AudioContext();
                }
                const audioCtx = audioCtxRef.current;
                if (audioCtx.state === 'suspended') await audioCtx.resume();

                const reader = audioRes.body!.getReader();
                const chunks: Uint8Array[] = [];
                while (true) {
                    const { value, done } = await reader.read();
                    if (done) break;
                    if (value) chunks.push(value);
                    if (abortCtrl.signal.aborted) return;
                }
                if (abortCtrl.signal.aborted) return;

                const totalLen = chunks.reduce((n, c) => n + c.byteLength, 0);
                const combined = new Uint8Array(totalLen);
                let offset = 0;
                for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.byteLength; }

                const audioBuffer = await audioCtx.decodeAudioData(combined.buffer);
                if (abortCtrl.signal.aborted) return;

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
                return; // audio playing, done
            }
        } catch (err) {
            if ((err as Error).name === 'AbortError') return;
            // fall through to browser TTS
        }

        // Browser TTS fallback
        if (!window.speechSynthesis || abortCtrl.signal.aborted) {
            cleanup();
            return;
        }

        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(script);
        u.rate = 0.92;
        u.pitch = 0.88;
        const voices = window.speechSynthesis.getVoices();
        const preferred =
            voices.find((v) => /en-GB|en-US/.test(v.lang) && /Google|Microsoft|Samantha|Daniel/i.test(v.name))
            ?? voices.find((v) => v.lang.startsWith('en'));
        if (preferred) u.voice = preferred;

        u.onend = () => { cleanup(); };
        u.onerror = () => { cleanup(); };
        synthRef.current = u;
        window.speechSynthesis.speak(u);
    }, [cleanup, startAmplitudePoll]);

    // -----------------------------------------------------------------------
    // Main narrate function — phase 1: stream text, phase 2: play audio
    // -----------------------------------------------------------------------
    const narrate = useCallback(async (req: NarrationRequest) => {
        cleanup();

        const abortCtrl = new AbortController();
        abortRef.current = abortCtrl;

        setIsNarrating(true);
        setAgentSpeaking(true);
        setActiveNarrationId(req.objectId);

        // Reset the HUD speech area
        useMissionStore.getState().beginAgentSpeech('');

        try {
            // Phase 1: stream narration tokens → HUD
            const streamRes = await api.narrateStream(req, abortCtrl.signal);
            if (!streamRes.ok || !streamRes.body) {
                throw new Error(`Stream request failed: ${streamRes.status}`);
            }

            const reader = streamRes.body.getReader();
            const decoder = new TextDecoder();
            let fullScript = '';
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                if (abortCtrl.signal.aborted) return;

                buffer += decoder.decode(value, { stream: true });

                // SSE lines are separated by double newlines
                const events = buffer.split('\n\n');
                buffer = events.pop() ?? ''; // last possibly incomplete chunk

                for (const event of events) {
                    const line = event.trim();
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (!raw) continue;
                    try {
                        const payload = JSON.parse(raw) as { token?: string; done?: boolean; fullScript?: string; error?: string };
                        if (payload.error) throw new Error(payload.error);
                        if (payload.token) {
                            fullScript += payload.token;
                            useMissionStore.getState().appendAgentSpeechToken(payload.token);
                        }
                        if (payload.done && payload.fullScript) {
                            fullScript = payload.fullScript; // use authoritative version
                        }
                    } catch (parseErr) {
                        if ((parseErr as Error).name === 'AbortError') return;
                        // ignore individual parse errors
                    }
                }
            }

            if (abortCtrl.signal.aborted) return;

            // Phase 2: play audio with the collected script
            if (fullScript.trim().length > 0) {
                await playAudio(fullScript, abortCtrl);
            } else {
                cleanup();
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                console.error('[useObjectNarration]', err);
            }
            cleanup();
        }
    }, [cleanup, setAgentSpeaking, setActiveNarrationId, playAudio]);

    return { narrate, cancel: cleanup, isNarrating, amplitude };
}
