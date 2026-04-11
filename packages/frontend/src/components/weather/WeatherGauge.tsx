import type { ReactNode } from 'react';
import type { WeatherStatus } from '../../utils/colors';
import { STATUS_COLORS } from '../../utils/colors';

interface WeatherGaugeProps {
    label: string;
    value: string | number;
    unit: string;
    icon: ReactNode;
    status: WeatherStatus;
}

export function WeatherGauge({ label, value, unit, icon, status }: WeatherGaugeProps) {
    const color = STATUS_COLORS[status];

    return (
        <div
            className="glass-panel flex-1 px-3 py-2 flex flex-col justify-between min-w-0"
            style={ { borderLeftWidth: 2, borderLeftColor: color } }
        >
            <div className="flex items-center gap-1.5">
                <span className="text-text-muted w-4 h-4 shrink-0">
                    { icon }
                </span>
                <span className="text-[10px] uppercase tracking-wider text-text-muted font-medium truncate">
                    { label }
                </span>
            </div>
            <div className="mt-1">
                <span
                    className="font-mono text-xl font-bold leading-none"
                    style={ { color } }
                >
                    { value }
                </span>
            </div>
            <span className="text-[10px] text-text-muted font-mono mt-1">
                { unit }
            </span>
        </div>
    );
}
