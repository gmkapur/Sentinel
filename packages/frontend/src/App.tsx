import { Shield } from 'lucide-react';
import { useSocket } from './hooks/useSocket';
import { useStatus } from './hooks/useStatus';
import { useAlerts } from './hooks/useAlerts';
import { useWatchlistAlerts } from './hooks/useWatchlistAlerts';
import { AppShell } from './components/layout/AppShell';

function App() {
    useSocket();
    useAlerts();
    useWatchlistAlerts();
    const { loading, error } = useStatus();

    if (loading) {
        return (
            <div className="h-screen w-screen bg-void flex flex-col items-center justify-center gap-4">
                <Shield size={ 32 } className="text-accent glow-breathe" />
                <span className="font-semibold text-sm tracking-[0.2em] uppercase text-text-secondary">
                    Orbit Sentinel
                </span>
                <div className="w-48 h-0.5 bg-border-subtle rounded-full overflow-hidden">
                    <div
                        className="h-full w-12 bg-accent rounded-full"
                        style={ { animation: 'loading-slide 1.5s ease-in-out infinite' } }
                    />
                </div>
                <span className="font-mono text-xs text-text-muted">
                    Establishing uplink...
                </span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-screen w-screen bg-void flex flex-col items-center justify-center gap-4">
                <Shield size={ 32 } className="text-risk-critical" />
                <span className="font-mono text-sm text-risk-critical">
                    CONNECTION FAILED
                </span>
                <span className="text-text-muted text-xs max-w-sm text-center">
                    { error }
                </span>
                <button
                    onClick={ () => window.location.reload() }
                    className="mt-2 px-4 py-1.5 rounded border border-accent/30 text-accent text-xs font-mono hover:bg-accent/10 transition-colors"
                >
                    Retry
                </button>
            </div>
        );
    }

    return <AppShell />;
}

export default App;
