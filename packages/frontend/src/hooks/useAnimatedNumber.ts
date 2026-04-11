import { useEffect, useRef, useState } from 'react';

export function useAnimatedNumber(
    target: number,
    duration: number = 600,
): number {
    const [display, setDisplay] = useState(target);
    const animationRef = useRef<number | null>(null);
    const startValueRef = useRef<number>(target);
    const startTimeRef = useRef<number>(0);
    const currentRef = useRef<number>(target);

    useEffect(() => {
        if (target === currentRef.current) return;

        startValueRef.current = currentRef.current;
        startTimeRef.current = performance.now();

        function animate(now: number) {
            const elapsed = now - startTimeRef.current;
            const progress = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            const value =
                startValueRef.current +
                (target - startValueRef.current) * eased;
            const rounded = Math.round(value);

            currentRef.current = rounded;
            setDisplay(rounded);

            if (progress < 1) {
                animationRef.current = requestAnimationFrame(animate);
            }
        }

        animationRef.current = requestAnimationFrame(animate);

        return () => {
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
            }
        };
    }, [target, duration]);

    return display;
}
