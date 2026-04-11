import { TopBar } from './TopBar';
import { SidePanel } from './SidePanel';
import { GlobeView } from '../globe/GlobeView';
import { SpaceWeatherBar } from '../weather/SpaceWeatherBar';

export function AppShell() {
    return (
        <div className="h-screen w-screen overflow-hidden bg-void grid grid-cols-[340px_1fr] grid-rows-[56px_1fr_140px]">
            <TopBar className="col-span-2" />
            <SidePanel className="row-span-2 overflow-hidden" />
            <GlobeView />
            <SpaceWeatherBar />
        </div>
    );
}
