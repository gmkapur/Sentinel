import { AlertTriangle, Shield } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { GlassPanel } from '../shared/GlassPanel';
import { AlertItem } from './AlertItem';
import { useMissionStore } from '../../stores/missionStore';

export function AlertFeed() {
    const alerts = useMissionStore((s) => s.alerts);

    return (
        <GlassPanel title="ALERT FEED" icon={<AlertTriangle size={14} />}>
            {alerts.length === 0 ? (
                <div className="py-6 flex flex-col items-center gap-2">
                    <Shield size={24} className="text-text-muted/30" />
                    <span className="text-text-muted text-xs italic">
                        No alerts recorded
                    </span>
                </div>
            ) : (
                <div className="overflow-y-auto max-h-[300px] -mx-1">
                    <AnimatePresence initial={false}>
                        {alerts.map((alert) => (
                            <AlertItem key={alert.id} alert={alert} />
                        ))}
                    </AnimatePresence>
                </div>
            )}
        </GlassPanel>
    );
}
