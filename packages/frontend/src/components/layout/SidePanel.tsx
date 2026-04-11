import { useState } from 'react';
import { MissionBriefCard } from '../risk/MissionBriefCard';
import { RiskBreakdownChart } from '../risk/RiskBreakdownChart';
import { AlertFeed } from '../alerts/AlertFeed';
import { SatelliteList } from '../satellite/SatelliteList';
import { WatchlistPanel } from '../satellite/WatchlistPanel';
import type { SatPosition } from '@sentinel/shared/src/types';

type Tab = 'mission' | 'satellites' | 'watchlist';

interface SidePanelProps {
    className?: string;
}

export function SidePanel({ className = '' }: SidePanelProps) {
    const [activeTab, setActiveTab] = useState<Tab>('mission');
    const [, setSelectedSat] = useState<SatPosition | null>(null);

    const handleSelectSatellite = (sat: SatPosition) => {
        setSelectedSat(sat);
    };

    const tabs: Array<{ id: Tab; label: string }> = [
        { id: 'mission', label: 'Mission' },
        { id: 'satellites', label: 'Satellites' },
        { id: 'watchlist', label: 'Watchlist' },
    ];

    return (
        <aside
            className={`bg-base border-r border-border-subtle flex flex-col overflow-hidden ${className}`}
        >
            {/* Tab bar */}
            <div className="flex border-b border-border-subtle shrink-0">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors ${
                            activeTab === tab.id
                                ? 'text-accent border-b-2 border-accent'
                                : 'text-text-muted hover:text-text-secondary'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
                {activeTab === 'mission' && (
                    <>
                        <MissionBriefCard />
                        <RiskBreakdownChart />
                        <AlertFeed />
                    </>
                )}

                {activeTab === 'satellites' && (
                    <SatelliteList onSelectSatellite={handleSelectSatellite} />
                )}

                {activeTab === 'watchlist' && (
                    <WatchlistPanel onSelectSatellite={handleSelectSatellite} />
                )}
            </div>
        </aside>
    );
}
