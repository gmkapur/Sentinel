import { Shield } from 'lucide-react';
import { useMissionStore } from '../../stores/missionStore';
import { RiskScorePill } from '../risk/RiskScorePill';
import { StatusDot } from '../shared/StatusDot';
import { formatTimestamp } from '../../utils/formatters';

interface TopBarProps {
    className?: string;
}

export function TopBar({ className = '' }: TopBarProps) {
    const risk = useMissionStore((s) => s.risk);
    const connection = useMissionStore((s) => s.connection);

    return (
        <header
            className={ `flex items-center justify-between px-4 bg-base border-b border-border-subtle z-50 ${className}` }
        >
            <div className="flex items-center gap-2.5">
                <Shield size={ 18 } className="text-accent" />
                <span className="font-semibold text-sm tracking-[0.2em] uppercase text-text-secondary">
                    Orbit Sentinel
                </span>
            </div>

            <div className="flex items-center">
                { risk ? (
                    <RiskScorePill score={ risk.score } level={ risk.level } />
                ) : (
                    <span className="font-mono text-xs text-text-muted">
                        Awaiting data...
                    </span>
                ) }
            </div>

            <div className="flex items-center gap-3">
                <StatusDot connected={ connection.connected } />
                <span className="font-mono text-[10px] text-text-muted">
                    { connection.lastUpdate
                        ? formatTimestamp(connection.lastUpdate)
                        : '---' }
                </span>
            </div>
        </header>
    );
}
