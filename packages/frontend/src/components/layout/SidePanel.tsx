import { MissionBriefCard } from '../risk/MissionBriefCard';
import { RiskBreakdownChart } from '../risk/RiskBreakdownChart';
import { AlertFeed } from '../alerts/AlertFeed';

interface SidePanelProps {
    className?: string;
}

export function SidePanel({ className = '' }: SidePanelProps) {
    return (
        <aside
            className={ `bg-base border-r border-border-subtle p-3 space-y-3 overflow-y-auto ${className}` }
        >
            <MissionBriefCard />
            <RiskBreakdownChart />
            <AlertFeed />
        </aside>
    );
}
