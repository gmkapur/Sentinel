import { useEffect, useState } from 'react';

export function useTypewriter(
    fullText: string,
    msPerChar: number,
    enabled: boolean
): string {
    const [out, setOut] = useState('');

    useEffect(() => {
        if (!enabled || !fullText) {
            setOut(fullText);
            return;
        }
        setOut('');
        let i = 0;
        const id = window.setInterval(() => {
            i += 1;
            setOut(fullText.slice(0, i));
            if (i >= fullText.length) {
                window.clearInterval(id);
            }
        }, msPerChar);
        return () => window.clearInterval(id);
    }, [enabled, fullText, msPerChar]);

    return enabled ? out : fullText;
}
