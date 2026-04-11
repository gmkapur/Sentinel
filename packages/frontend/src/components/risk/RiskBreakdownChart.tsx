import { Activity, Zap, Wind, AlertTriangle, Orbit } from 'lucide-react';
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { GlassPanel } from '../shared/GlassPanel';
import { useMissionStore } from '../../stores/missionStore';
import { RISK_COLORS } from '../../utils/colors';

interface BarRowProps {
    label: string;
    icon: ReactNode;
    value: number;
    color: string;
}

function BarRow({ label, icon, value, color }: BarRowProps) {
    return (
        <div className="flex items-center gap-2">
            <span className="text-text-muted w-3.5 h-3.5 shrink-0">
                { icon }
            </span>
            <span className="text-[11px] text-text-secondary w-20 shrink-0">
                { label }
            </span>
            <div className="flex-1 h-1.5 bg-border-subtle/30 rounded-full overflow-hidden">
                <motion.div
                    className="h-full rounded-full"
                    style={ { backgroundColor: color } }
                    initial={ { width: 0 } }
                    animate={ { width: `${Math.min(value, 100)}%` } }
                    transition={ { type: 'spring', stiffness: 200, damping: 25 } }
                />
            </div>
            <span className="font-mono text-[11px] text-text-secondary w-6 text-right shrink-0">
                { value }
            </span>
        </div>
    );
}

const BREAKDOWN_CONFIG = [
    { key: 'flare', label: 'Solar Flare', icon: <Zap size={ 14 } /> },
    { key: 'geomagnetic', label: 'Geomagnetic', icon: <Activity size={ 14 } /> },
    { key: 'radiation', label: 'Radiation', icon: <Activity size={ 14 } /> },
    { key: 'solarWind', label: 'Solar Wind', icon: <Wind size={ 14 } /> },
    { key: 'imfBz', label: 'IMF Bz', icon: <Activity size={ 14 } /> },
    { key: 'neo', label: 'NEO', icon: <Orbit size={ 14 } /> },
    { key: 'compound', label: 'Compound', icon: <AlertTriangle size={ 14 } /> },
] as const;

export function RiskBreakdownChart() {
    const risk = useMissionStore((s) => s.risk);

    return (
        <GlassPanel title="RISK BREAKDOWN" icon={ <Activity size={ 14 } /> }>
            { !risk ? (
                <div className="py-4 text-center">
                    <span className="text-text-muted text-xs italic">
                        Awaiting data...
                    </span>
                </div>
            ) : (
                <div>
                    <div className="flex items-baseline gap-1 mb-3">
                        <span
                            className="font-mono text-2xl font-bold"
                            style={ { color: RISK_COLORS[risk.level] } }
                        >
                            { risk.score }
                        </span>
                        <span className="text-text-muted text-sm">/100</span>
                    </div>

                    <div className="space-y-2">
                        { BREAKDOWN_CONFIG.map(({ key, label, icon }) => (
                            <BarRow
                                key={ key }
                                label={ label }
                                icon={ icon }
                                value={ risk.breakdown[key as keyof typeof risk.breakdown] }
                                color={ RISK_COLORS[risk.level] }
                            />
                        )) }
                    </div>
                </div>
            ) }
        </GlassPanel>
    );
}
