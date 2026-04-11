import { motion } from 'framer-motion';
import type { AlertRecord } from '@sentinel/shared/src/types';
import { LevelBadge } from '../shared/LevelBadge';
import { formatTimestamp } from '../../utils/formatters';
import { RISK_COLORS } from '../../utils/colors';

interface AlertItemProps {
    alert: AlertRecord;
}

export function AlertItem({ alert }: AlertItemProps) {
    return (
        <motion.div
            initial={ { opacity: 0, x: -20 } }
            animate={ { opacity: 1, x: 0 } }
            transition={ { duration: 0.25 } }
            className="py-2 px-2 border-b border-border-subtle last:border-b-0 hover:bg-hover/50 transition-colors"
            style={ { borderLeftWidth: 2, borderLeftColor: RISK_COLORS[alert.level] } }
        >
            <div className="flex items-center justify-between">
                <LevelBadge level={ alert.level } />
                <span className="font-mono text-[10px] text-text-muted">
                    { formatTimestamp(alert.timestamp) }
                </span>
            </div>
            <p className="text-xs text-text-secondary mt-1 line-clamp-2">
                { alert.brief }
            </p>
            <span className="font-mono text-[10px] text-text-muted">
                Score: { alert.score }
            </span>
        </motion.div>
    );
}
