import type { RiskLevel } from '@sentinel/shared/src/types';

interface LevelBadgeProps {
    level: RiskLevel;
    size?: 'sm' | 'md';
}

const LEVEL_CLASSES: Record<RiskLevel, string> = {
    LOW: 'bg-risk-low/15 text-risk-low',
    MODERATE: 'bg-risk-moderate/15 text-risk-moderate',
    HIGH: 'bg-risk-high/15 text-risk-high',
    CRITICAL: 'bg-risk-critical/15 text-risk-critical animate-pulse',
};

const SIZE_CLASSES = {
    sm: 'text-[10px] px-1.5 py-0.5',
    md: 'text-xs px-2 py-1',
};

export function LevelBadge({ level, size = 'sm' }: LevelBadgeProps) {
    return (
        <span
            className={ `inline-block rounded font-mono font-medium uppercase ${SIZE_CLASSES[size]} ${LEVEL_CLASSES[level]}` }
        >
            { level }
        </span>
    );
}
