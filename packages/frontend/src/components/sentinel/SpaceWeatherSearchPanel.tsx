import { useMemo } from 'react';
import { useMissionStore } from '../../stores/missionStore';
import {
    SPACE_WEATHER_CATALOG,
    WEATHER_CATEGORY_PILLS,
} from '../../data/spaceWeatherCatalog';

const TEAL = '#14B8A6';
const MUTED = '#7A8FA8';
const LABEL = '#D6E4F0';

export function SpaceWeatherSearchPanel() {
    const open = useMissionStore((s) => s.weatherSearchOpen);
    const query = useMissionStore((s) => s.weatherSearchQuery);
    const pill = useMissionStore((s) => s.weatherCategoryPill);
    const activeIds = useMissionStore((s) => s.activeWeatherEventIds);
    const setQuery = useMissionStore((s) => s.setWeatherSearchQuery);
    const setPill = useMissionStore((s) => s.setWeatherCategoryPill);
    const toggle = useMissionStore((s) => s.toggleWeatherCatalogEvent);
    const clearAll = useMissionStore((s) => s.clearWeatherCatalogSelection);
    const setWeatherSearchOpen = useMissionStore((s) => s.setWeatherSearchOpen);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        return SPACE_WEATHER_CATALOG.filter((event) => {
            const catOk = pill === 'ALL' || event.category === pill;
            if (!catOk) return false;
            if (!q) return true;
            return (
                event.name.toLowerCase().includes(q)
                || event.category.toLowerCase().includes(q)
                || event.severity.toLowerCase().includes(q)
                || event.id.toLowerCase().includes(q)
            );
        });
    }, [query, pill]);

    return (
        <div
            className="weather-search-panel pointer-events-auto fixed top-0 right-0 z-[1000] flex h-screen w-[min(320px,92vw)] flex-col border-l border-[#14B8A6]/50 bg-[rgba(3,5,10,0.95)] px-6 py-6 font-mono transition-transform duration-300 ease-out"
            style={ {
                transform: open ? 'translateX(0)' : 'translateX(100%)',
                borderLeftWidth: '0.5px',
            } }
            aria-hidden={ !open }
        >
            <div
                style={ {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '20px',
                } }
            >
                <span
                    style={ {
                        fontSize: '8px',
                        fontFamily: 'Courier New, ui-monospace, monospace',
                        color: '#1DD4BF',
                        letterSpacing: '4px',
                    } }
                >
                    SPACE WEATHER CATALOG
                </span>
                <button
                    type="button"
                    onClick={ () => setWeatherSearchOpen(false) }
                    style={ {
                        background: 'transparent',
                        border: '0.5px solid #1DD4BF',
                        color: '#1DD4BF',
                        fontFamily: 'Courier New, ui-monospace, monospace',
                        fontSize: '9px',
                        letterSpacing: '2px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                    } }
                >
                    ← BACK
                </button>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1">
                    { WEATHER_CATEGORY_PILLS.map((p) => {
                        const on = pill === p;
                        return (
                            <button
                                key={ p }
                                type="button"
                                onClick={ () => setPill(p) }
                                className="border px-1.5 py-0.5 text-[7px] font-medium uppercase tracking-wide"
                                style={ {
                                    borderColor: on ? TEAL : `${TEAL}44`,
                                    color: on ? '#030508' : `${TEAL}99`,
                                    background: on ? TEAL : 'transparent',
                                } }
                            >
                                { p }
                            </button>
                        );
                    }) }
                </div>
                <button
                    type="button"
                    className="ml-auto shrink-0 border px-2 py-0.5 text-[8px] font-medium uppercase tracking-wider"
                    style={ { borderColor: `${TEAL}55`, color: TEAL } }
                    onClick={ clearAll }
                >
                    Clear all
                </button>
            </div>

            <input
                type="search"
                placeholder="SEARCH EVENTS..."
                value={ query }
                onChange={ (e) => setQuery(e.target.value) }
                className="mb-4 w-full border px-2 py-2 text-[10px] outline-none"
                style={ {
                    borderColor: `${TEAL}66`,
                    background: 'transparent',
                    color: TEAL,
                } }
            />

            <div className="min-h-0 flex-1 space-y-0 overflow-y-auto pr-1">
                { filtered.map((event) => {
                    const isOn = activeIds.includes(event.id);
                    return (
                        <button
                            key={ event.id }
                            type="button"
                            onClick={ () => toggle(event.id) }
                            className="flex w-full cursor-pointer items-center gap-2.5 border-b border-[#1A2B45]/80 py-2 text-left"
                            style={ { opacity: isOn ? 1 : 0.45 } }
                        >
                            <div
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={ {
                                    background: isOn ? '#E84040' : '#3A4F68',
                                } }
                            />
                            <div>
                                <div
                                    className="text-[9px] font-medium uppercase tracking-wide"
                                    style={ { color: LABEL } }
                                >
                                    { event.name }
                                </div>
                                <div className="text-[8px]" style={ { color: MUTED } }>
                                    { event.category }  ··  { event.severity }
                                </div>
                            </div>
                        </button>
                    );
                }) }
            </div>
        </div>
    );
}
