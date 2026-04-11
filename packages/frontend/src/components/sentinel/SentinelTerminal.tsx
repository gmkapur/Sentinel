import { GlobeCommandView } from './GlobeCommandView';

export function SentinelTerminal() {
    return (
        <div className="relative h-screen w-screen overflow-hidden bg-[#030508]">
            <GlobeCommandView />
        </div>
    );
}
