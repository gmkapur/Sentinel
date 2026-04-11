import { useCallback, useRef } from 'react';
import { useMissionStore } from '../stores/missionStore';

function speakLine(
    text: string,
    onStart: () => void,
    onEnd: () => void,
    onError: () => void
): void {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
        useMissionStore.getState().setAgentSpeechRevealEnd(text.length);
        onEnd();
        useMissionStore.getState().endAgentSpeech();
        return;
    }
    window.speechSynthesis.cancel();
    let finished = false;
    const finish = (handler: () => void) => {
        if (finished) return;
        finished = true;
        clearTick();
        bumpReveal(text.length);
        handler();
        useMissionStore.getState().endAgentSpeech();
    };

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.pitch = 0.9;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
        voices.find((v) => /en-GB|en-US/.test(v.lang) && /Google|Microsoft|Samantha|Daniel/i.test(v.name))
        ?? voices.find((v) => v.lang.startsWith('en'));
    if (preferred) u.voice = preferred;

    let tick: number | null = null;
    const clearTick = () => {
        if (tick != null) {
            window.clearInterval(tick);
            tick = null;
        }
    };

    const bumpReveal = (endExclusive: number) => {
        useMissionStore.getState().setAgentSpeechRevealEnd(endExclusive);
    };

    u.onboundary = (e) => {
        const ev = e as SpeechSynthesisEvent & { charLength?: number };
        if (typeof ev.charIndex === 'number' && ev.charIndex >= 0) {
            const len = typeof ev.charLength === 'number' && ev.charLength > 0 ? ev.charLength : 1;
            bumpReveal(ev.charIndex + len);
        }
    };

    u.onstart = () => {
        onStart();
        let pos = 0;
        tick = window.setInterval(() => {
            pos = Math.min(text.length, pos + 1);
            bumpReveal(pos);
            if (pos >= text.length) clearTick();
        }, 35);
    };

    u.onend = () => {
        finish(onEnd);
    };

    u.onerror = () => {
        finish(onError);
    };

    window.speechSynthesis.speak(u);
}

export function useAgentSpeech() {
    const setAgentSpeaking = useMissionStore((s) => s.setAgentSpeaking);
    const setAgentRingTone = useMissionStore((s) => s.setAgentRingTone);
    const beginAgentSpeech = useMissionStore((s) => s.beginAgentSpeech);
    const busyRef = useRef(false);

    const speak = useCallback(
        (
            text: string,
            tone: 'nominal' | 'warning' | 'critical' = 'nominal'
        ): Promise<void> => {
            return new Promise((resolve) => {
                if (busyRef.current) {
                    resolve();
                    return;
                }
                busyRef.current = true;
                setAgentRingTone(tone);
                beginAgentSpeech(text);
                speakLine(
                    text,
                    () => {
                        setAgentSpeaking(true);
                    },
                    () => {
                        setAgentSpeaking(false);
                        busyRef.current = false;
                        resolve();
                    },
                    () => {
                        setAgentSpeaking(false);
                        busyRef.current = false;
                        resolve();
                    }
                );
            });
        },
        [beginAgentSpeech, setAgentRingTone, setAgentSpeaking]
    );

    const cancel = useCallback(() => {
        window.speechSynthesis?.cancel();
        setAgentSpeaking(false);
        busyRef.current = false;
        useMissionStore.getState().endAgentSpeech();
    }, [setAgentSpeaking]);

    return { speak, cancel };
}
