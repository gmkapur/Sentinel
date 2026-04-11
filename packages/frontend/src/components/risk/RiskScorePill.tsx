import { motion, AnimatePresence } from 'framer-motion';
import type { RiskLevel } from '@sentinel/shared/src/types';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import {
    RISK_COLORS,
    RISK_BG_COLORS,
    RISK_BORDER_COLORS,
} from '../../utils/colors';

interface RiskScorePillProps {
    score: number;
    level: RiskLevel;
}

export function RiskScorePill({ score, level }: RiskScorePillProps) {
    const animatedScore = useAnimatedNumber(score);
    const isCritical = level === 'CRITICAL';

    return (
        <div
            className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 border ${isCritical ? 'critical-pulse' : ''}`}
            style={{
                backgroundColor: RISK_BG_COLORS[level],
                borderColor: RISK_BORDER_COLORS[level],
            }}
        >
            <AnimatePresence mode="wait">
                <motion.span
                    key={animatedScore}
                    className="font-mono font-bold text-lg leading-none"
                    style={{ color: RISK_COLORS[level] }}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.15 }}
                >
                    {String(animatedScore).padStart(2, '0')}
                </motion.span>
            </AnimatePresence>
            <span className="text-[10px] uppercase tracking-wider text-text-secondary font-medium">
                {level}
            </span>
        </div>
    );
}
