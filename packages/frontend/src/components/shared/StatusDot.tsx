interface StatusDotProps {
    connected: boolean;
}

export function StatusDot({ connected }: StatusDotProps) {
    return (
        <span
            className={`inline-block w-2 h-2 rounded-full ${
                connected
                    ? 'bg-risk-low shadow-[0_0_6px_rgba(34,197,94,0.6)]'
                    : 'bg-risk-critical animate-pulse'
            }`}
            title={connected ? 'Connected' : 'Disconnected'}
        />
    );
}
