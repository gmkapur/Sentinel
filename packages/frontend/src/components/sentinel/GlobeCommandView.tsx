import { useRef, useCallback, useEffect, useMemo } from 'react';
import { GlobeView, type GlobeViewHandle } from '../globe/GlobeView';
import {
    useMissionStore,
    type UiThreatLevel,
    type SelectedAsset,
    type CinematicArcPulse,
} from '../../stores/missionStore';
import { buildOrbitalThreatPolygons } from '../../globe/threatOrbitalZones';
import { generateInclinedOrbitPath } from '../../globe/orbitPathUtils';
import { useAnimatedNumber } from '../../hooks/useAnimatedNumber';
import { DUMMY_WEATHER_EVENTS } from '../../mocks/dummyWeatherEvents';
import {
    satellitesLinkedToWeather,
    weatherLinkedToSatellite,
} from '../../utils/globeLinking';
import { EARTH_RADIUS_KM } from '../../utils/constants';
import { api } from '../../services/api';
import { SpaceWeatherSearchPanel } from './SpaceWeatherSearchPanel';
import { AgentPixelHud } from './hud/AgentPixelHud';
import type { SatPosition } from '@sentinel/shared/src/types';

const TEAL = '#14B8A6';
const LABEL = '#6d7f7c';

function threatTone(level: UiThreatLevel): 'teal' | 'amber' | 'red' {
    if (level === 'CRITICAL' || level === 'HIGH') return 'red';
    if (level === 'WARNING') return 'amber';
    return 'teal';
}

function ThreatBar({ pct, tone }: { pct: number; tone: 'teal' | 'amber' | 'red' }) {
    const filled = Math.round((pct / 100) * 10);
    const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
    const color =
        tone === 'teal' ? TEAL : tone === 'amber' ? '#F59E0B' : '#EF4444';
    return <span className="tracking-tight" style={ { color } }>{ bar }</span>;
}

function HudRule({ className = '' }: { className?: string }) {
    return (
        <div className={ `h-px w-full bg-[#14B8A6]/20 ${className}` } />
    );
}

function selectedAssetFromSatellite(
    sat: SatPosition,
    relatedWeatherCount: number
): SelectedAsset {
    const rc = sat.registryClass ?? 'LEO';
    return {
        id: String(sat.id),
        name: sat.name,
        orbit: rc,
        altitudeKm: Math.round(sat.alt),
        status: 'TRACKING',
        threat:
            relatedWeatherCount > 0
                ? `${relatedWeatherCount} CORRELATED SURFACE EVENTS`
                : 'NONE',
        action: 'MONITOR',
        lat: sat.lat,
        lng: sat.lng,
    };
}

export function GlobeCommandView() {
    const globeRef = useRef<GlobeViewHandle>(null);

    const threatLevel = useMissionStore((s) => s.threatLevel);
    const threatBarPct = useMissionStore((s) => s.threatBarPct);
    const globeHud = useMissionStore((s) => s.globeHud);
    const zoomState = useMissionStore((s) => s.zoomState);
    const selectedAsset = useMissionStore((s) => s.selectedAsset);
    const liveStats = useMissionStore((s) => s.liveStats);
    const globeDriftFrozen = useMissionStore((s) => s.globeDriftFrozen);
    const globeLinkHighlights = useMissionStore((s) => s.globeLinkHighlights);
    const focusedWeatherEventId = useMissionStore((s) => s.focusedWeatherEventId);
    const weatherSearchOpen = useMissionStore((s) => s.weatherSearchOpen);
    const setWeatherSearchOpen = useMissionStore((s) => s.setWeatherSearchOpen);
    const overlaySolarFlare = useMissionStore((s) => s.overlaySolarFlare);
    const overlaySolarStorm = useMissionStore((s) => s.overlaySolarStorm);
    const overlayDebris = useMissionStore((s) => s.overlayDebris);
    const overlayGeomagnetic = useMissionStore((s) => s.overlayGeomagnetic);
    const overlayRadiationActive = useMissionStore(
        (s) => s.overlayRadiationActive
    );
    const activeThreats = useMissionStore((s) => s.activeThreats);

    const zoneCount = useMemo(
        () =>
            buildOrbitalThreatPolygons({
                overlaySolarFlare,
                overlaySolarStorm,
                overlayDebris,
                overlayGeomagnetic,
                overlayRadiationActive,
                threatLevel,
                activeThreats,
            }).length,
        [
            activeThreats,
            overlayDebris,
            overlayGeomagnetic,
            overlayRadiationActive,
            overlaySolarFlare,
            overlaySolarStorm,
            threatLevel,
        ]
    );

    const legendTone =
        zoneCount > 0 ? 'text-[#8a9a96]' : 'text-[#14B8A6]/35';

    const tone = threatTone(threatLevel);
    const reg = liveStats.orbitalRegistry;
    const leoDisplay = useAnimatedNumber(reg.leo, 800);
    const meoDisplay = useAnimatedNumber(reg.meo, 800);
    const geoDisplay = useAnimatedNumber(reg.geo, 800);
    const stationsDisplay = useAnimatedNumber(reg.stations, 800);
    const debrisDisplay = useAnimatedNumber(reg.debris, 800);
    const totalDisplay = useAnimatedNumber(reg.total, 800);
    const riskDisplay = useAnimatedNumber(liveStats.atRiskAssets, 800);

    const focusedWeather = useMemo(
        () => DUMMY_WEATHER_EVENTS.find((e) => e.id === focusedWeatherEventId) ?? null,
        [focusedWeatherEventId]
    );

    const focusSatellite = useCallback((sat: SatPosition) => {
        const st = useMissionStore.getState();
        st.setTacticalLinkArcs([]);
        st.setAssetSituationSummary(null);
        st.setOrbitSuggestionLoading(false);
        st.setOrbitSuggestionResult(null);
        st.setOrbitPaths({ original: null, suggested: null });
        const { affected, potential } = weatherLinkedToSatellite(sat, DUMMY_WEATHER_EVENTS);
        st.setGlobeDriftFrozen(true);
        st.setFocusedWeatherEventId(null);
        st.setGlobeLinkHighlights({
            satellitesAffected: [],
            satellitesPotential: [],
            weatherAffected: affected,
            weatherPotential: potential,
        });
        st.setZoomState('ASSET_LOCK');
        st.setSelectedAsset(
            selectedAssetFromSatellite(sat, affected.length + potential.length)
        );
        globeRef.current?.flyToOrbitalSatellite(
            sat.name,
            { lat: sat.lat, lng: sat.lng, altitudeKm: sat.alt },
            { ms: 900 }
        );
    }, []);

    const focusWeatherById = useCallback((eventId: string) => {
        const ev = DUMMY_WEATHER_EVENTS.find((e) => e.id === eventId);
        if (!ev) return;
        const st = useMissionStore.getState();
        st.setTacticalLinkArcs([]);
        st.setAssetSituationSummary(null);
        st.setOrbitSuggestionLoading(false);
        st.setOrbitSuggestionResult(null);
        st.setOrbitPaths({ original: null, suggested: null });
        const { affected, potential } = satellitesLinkedToWeather(
            ev.lat,
            ev.lng,
            st.satellites
        );
        st.setGlobeDriftFrozen(true);
        st.setFocusedWeatherEventId(ev.id);
        st.setGlobeLinkHighlights({
            satellitesAffected: affected,
            satellitesPotential: potential,
            weatherAffected: [],
            weatherPotential: [],
        });
        st.setZoomState('ZONE_LOCK');
        st.setSelectedAsset(null);
        globeRef.current?.pointOfView(
            { lat: ev.lat, lng: ev.lng, altitude: 0.48 },
            900
        );
    }, []);

    const resetView = useCallback(() => {
        globeRef.current?.resetPov(600);
        useMissionStore.getState().clearGlobeInteraction();
    }, []);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') resetView();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [resetView]);

    /** After asset lock: pull back, draw threat links, situation copy, orbit suggestion + paths. */
    useEffect(() => {
        if (zoomState !== 'ASSET_LOCK' || !selectedAsset?.name) return;
        const sat = useMissionStore.getState().satellites.find((s) => s.name === selectedAsset.name);
        if (!sat) return;

        const assetNameLocked = selectedAsset.name;
        const tZoomOut = window.setTimeout(() => {
            const cur = useMissionStore.getState();
            if (cur.zoomState !== 'ASSET_LOCK' || cur.selectedAsset?.name !== assetNameLocked) return;
            globeRef.current?.pointOfView(
                {
                    lat: sat.lat,
                    lng: sat.lng,
                    altitude: sat.alt / EARTH_RADIUS_KM + 0.62,
                },
                1100
            );
        }, 1050);

        const tLinks = window.setTimeout(() => {
            const cur = useMissionStore.getState();
            if (cur.zoomState !== 'ASSET_LOCK' || cur.selectedAsset?.name !== assetNameLocked) return;

            const { weatherAffected, weatherPotential } = cur.globeLinkHighlights;
            const relAlt = sat.alt / EARTH_RADIUS_KM;
            const ids = [...weatherAffected, ...weatherPotential];
            const arcs: CinematicArcPulse[] = ids
                .map((id) => {
                    const ev = DUMMY_WEATHER_EVENTS.find((e) => e.id === id);
                    if (!ev) return null;
                    return {
                        id: `tactical-${id}`,
                        startLat: sat.lat,
                        startLng: sat.lng,
                        startAltitude: relAlt,
                        endLat: ev.lat,
                        endLng: ev.lng,
                        endAltitude: 0.015,
                    };
                })
                .filter((x): x is CinematicArcPulse => x !== null);
            cur.setTacticalLinkArcs(arcs);

            const namesA = weatherAffected
                .map((id) => DUMMY_WEATHER_EVENTS.find((e) => e.id === id)?.name)
                .filter(Boolean) as string[];
            const namesP = weatherPotential
                .map((id) => DUMMY_WEATHER_EVENTS.find((e) => e.id === id)?.name)
                .filter(Boolean) as string[];
            let summary = `Situation — ${sat.name} @ ${Math.round(sat.alt)} KM. `;
            if (namesA.length) {
                summary += `Correlated surface events: ${namesA.join('; ')}. `;
            }
            if (namesP.length) {
                summary += `Potential links: ${namesP.join('; ')}. `;
            }
            if (!namesA.length && !namesP.length) {
                summary +=
                    'No dummy surface events met correlation thresholds at this subsatellite point. ';
            }
            summary += 'Continue conjunction screening and charging monitors.';
            cur.setAssetSituationSummary(summary);

            const primaryId = weatherAffected[0] ?? weatherPotential[0];
            const primaryEv = primaryId
                ? DUMMY_WEATHER_EVENTS.find((e) => e.id === primaryId)
                : null;
            cur.setOrbitSuggestionLoading(true);
            const body = {
                satellite: {
                    id: String(sat.id),
                    altitudeKm: sat.alt,
                    lat: sat.lat,
                    lng: sat.lng,
                    inclination: 53,
                },
                threat: {
                    type: primaryEv ? 'SURFACE_WEATHER' : 'GENERIC',
                    name: primaryEv?.name ?? 'SPACE WEATHER COMPOSITE',
                    severity: primaryEv?.severity ?? 'MODERATE',
                    assetsAtRisk: namesA.length + namesP.length,
                    description: summary.slice(0, 400),
                    impactHours: primaryEv?.severity === 'EXTREME' ? 6 : 18,
                },
                currentOrbit: {
                    altitudeKm: sat.alt,
                    inclination: 53,
                    lat: sat.lat,
                    lng: sat.lng,
                },
            };
            void api
                .postOrbitSuggestion(body)
                .then((res) => {
                    const latest = useMissionStore.getState();
                    if (latest.zoomState !== 'ASSET_LOCK' || latest.selectedAsset?.name !== assetNameLocked) return;
                    latest.setOrbitSuggestionResult(res.suggestion);
                    latest.setOrbitPaths({
                        original: generateInclinedOrbitPath(sat.lat, sat.lng, sat.alt, 53),
                        suggested: generateInclinedOrbitPath(
                            sat.lat,
                            sat.lng,
                            res.newOrbit.altitudeKm,
                            res.newOrbit.inclination
                        ),
                    });
                })
                .catch(() => {
                    /* offline / validation — HUD still usable */
                })
                .finally(() => {
                    useMissionStore.getState().setOrbitSuggestionLoading(false);
                });
        }, 1050 + 1250);

        return () => {
            window.clearTimeout(tZoomOut);
            window.clearTimeout(tLinks);
        };
    }, [zoomState, selectedAsset?.name]);

    const showZoomHud =
        globeDriftFrozen
        || zoomState !== 'OVERVIEW'
        || globeHud.zoomMul > 1.12;
    const showAsset = zoomState === 'ASSET_LOCK' && selectedAsset;

    const weatherById = useCallback(
        (id: string) => DUMMY_WEATHER_EVENTS.find((e) => e.id === id),
        []
    );

    return (
        <div className="relative h-screen w-screen overflow-hidden bg-[#030508] font-mono text-[#e8e8e8]">
            <AgentPixelHud />
            <div className="globe-stage absolute inset-0 globe-vm-OPTICAL">
                <GlobeView
                    ref={ globeRef }
                    className="h-full w-full"
                    onSatelliteClick={ focusSatellite }
                    onWeatherEventClick={ focusWeatherById }
                />
            </div>

            <button
                type="button"
                className="space-weather-search-button pointer-events-auto z-[61] border px-2 py-1 text-[8px] font-medium uppercase tracking-[0.18em]"
                style={ { borderColor: `${TEAL}88`, color: TEAL, background: `${TEAL}10` } }
                onClick={ () => setWeatherSearchOpen(!weatherSearchOpen) }
            >
                SPACE WEATHER SEARCH
            </button>

            <SpaceWeatherSearchPanel />

            <div className="threat-level-badge pointer-events-none z-40 flex w-[min(280px,38vw)] flex-col items-end gap-2 text-right">
                <div className="relative px-3 py-2">
                    <div className="text-[10px] font-medium" style={ { color: LABEL } }>
                        THREAT LEVEL
                    </div>
                    <div className="mt-1 flex items-baseline justify-end gap-2">
                        <ThreatBar pct={ threatBarPct } tone={ tone } />
                        <span
                            className="text-[11px] font-medium"
                            style={ {
                                color:
                                    tone === 'red'
                                        ? '#EF4444'
                                        : tone === 'amber'
                                          ? '#F59E0B'
                                          : TEAL,
                            } }
                        >
                            { threatLevel }
                        </span>
                    </div>
                </div>
                <HudRule />
            </div>
            <div className="orbital-registry pointer-events-none z-30 flex flex-col items-end gap-2 text-right">
                <div className="w-full space-y-2 pr-1">
                    <div
                        className="text-[9px] font-medium uppercase tracking-wide"
                        style={ { color: LABEL } }
                    >
                        Orbital registry
                    </div>
                    <div className="space-y-1.5">
                        <div className="flex items-baseline justify-between gap-2">
                            <span
                                className="text-[8px] font-medium uppercase tracking-wide"
                                style={ { color: LABEL } }
                            >
                                LEO assets
                            </span>
                            <span
                                className="text-[16px] font-light tabular-nums"
                                style={ { color: TEAL } }
                            >
                                { leoDisplay.toLocaleString() }
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span
                                className="text-[8px] font-medium uppercase tracking-wide"
                                style={ { color: LABEL } }
                            >
                                MEO assets
                            </span>
                            <span
                                className="text-[16px] font-light tabular-nums"
                                style={ { color: TEAL } }
                            >
                                { meoDisplay.toLocaleString() }
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span
                                className="text-[8px] font-medium uppercase tracking-wide"
                                style={ { color: LABEL } }
                            >
                                GEO assets
                            </span>
                            <span
                                className="text-[16px] font-light tabular-nums"
                                style={ { color: TEAL } }
                            >
                                { geoDisplay.toLocaleString() }
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span
                                className="text-[8px] font-medium uppercase tracking-wide"
                                style={ { color: LABEL } }
                            >
                                Space stations
                            </span>
                            <span
                                className="text-[16px] font-light tabular-nums"
                                style={ { color: TEAL } }
                            >
                                { stationsDisplay.toLocaleString() }
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2">
                            <span
                                className="text-[8px] font-medium uppercase tracking-wide"
                                style={ { color: LABEL } }
                            >
                                Debris objects
                            </span>
                            <span
                                className="text-[16px] font-light tabular-nums"
                                style={ { color: TEAL } }
                            >
                                { debrisDisplay.toLocaleString() }
                            </span>
                        </div>
                        <div className="flex items-baseline justify-between gap-2 pt-1.5">
                            <span
                                className="text-[8px] font-medium uppercase tracking-wide"
                                style={ { color: LABEL } }
                            >
                                Total tracked
                            </span>
                            <span
                                className="text-[22px] font-light leading-none tabular-nums"
                                style={ { color: TEAL } }
                            >
                                { totalDisplay.toLocaleString() }
                            </span>
                        </div>
                    </div>
                    <div>
                        <div
                            className="text-[9px] font-medium uppercase tracking-wide"
                            style={ { color: LABEL } }
                        >
                            At-risk assets
                        </div>
                        <div
                            className="text-[28px] font-light leading-none tabular-nums"
                            style={ {
                                color:
                                    liveStats.atRiskAssets > 0 ? '#F59E0B' : TEAL,
                            } }
                        >
                            { riskDisplay.toLocaleString() }
                        </div>
                    </div>
                </div>
            </div>

            { showAsset && selectedAsset && (
                <div className="absolute bottom-[7.5rem] right-4 z-30 max-w-[min(340px,46vw)]">
                    <div className="relative bg-[rgba(3,5,10,0.88)] px-3 py-2">
                        <div
                            className="text-[9px] font-medium uppercase tracking-wide"
                            style={ { color: LABEL } }
                        >
                            Asset lock
                        </div>
                        <div
                            className="mt-1 text-[11px] font-medium text-white"
                        >
                            { selectedAsset.name }
                        </div>
                        <div className="mt-2 space-y-1 text-[9px]">
                            <div>
                                <span style={ { color: LABEL } }>ORBIT</span>{ ' ' }
                                <span className="font-light" style={ { color: TEAL } }>
                                    { selectedAsset.orbit }
                                </span>
                            </div>
                            <div>
                                <span style={ { color: LABEL } }>ALTITUDE</span>{ ' ' }
                                <span className="font-light tabular-nums" style={ { color: TEAL } }>
                                    { selectedAsset.altitudeKm } KM
                                </span>
                            </div>
                            <div>
                                <span style={ { color: LABEL } }>STATUS</span>{ ' ' }
                                <span className="font-light" style={ { color: TEAL } }>
                                    { selectedAsset.status }
                                </span>
                            </div>
                            <div>
                                <span style={ { color: LABEL } }>CORRELATION</span>{ ' ' }
                                <span className="font-light text-[#F59E0B]">
                                    { selectedAsset.threat }
                                </span>
                            </div>
                        </div>
                        { (globeLinkHighlights.weatherAffected.length > 0
                            || globeLinkHighlights.weatherPotential.length > 0) && (
                            <div className="mt-3 border-t border-[#14B8A6]/15 pt-2">
                                <div
                                    className="mb-1 text-[8px] font-medium uppercase tracking-wide"
                                    style={ { color: LABEL } }
                                >
                                    Linked surface events
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    { globeLinkHighlights.weatherAffected.map((id) => {
                                        const w = weatherById(id);
                                        if (!w) return null;
                                        return (
                                            <button
                                                key={ `wa-${id}` }
                                                type="button"
                                                className="pointer-events-auto border px-1.5 py-0.5 text-left text-[8px] font-medium uppercase tracking-wide"
                                                style={ {
                                                    borderColor: 'rgba(248,113,113,0.55)',
                                                    color: '#FCA5A5',
                                                    background: 'rgba(40,10,10,0.5)',
                                                } }
                                                onClick={ () => focusWeatherById(id) }
                                            >
                                                { w.name }
                                            </button>
                                        );
                                    }) }
                                    { globeLinkHighlights.weatherPotential.map((id) => {
                                        const w = weatherById(id);
                                        if (!w) return null;
                                        return (
                                            <button
                                                key={ `wp-${id}` }
                                                type="button"
                                                className="pointer-events-auto border px-1.5 py-0.5 text-left text-[8px] font-medium uppercase tracking-wide"
                                                style={ {
                                                    borderColor: 'rgba(245,158,11,0.45)',
                                                    color: '#FCD34D',
                                                    background: 'rgba(40,30,8,0.45)',
                                                } }
                                                onClick={ () => focusWeatherById(id) }
                                            >
                                                { w.name }{ ' ' }
                                                <span className="opacity-70">(potential)</span>
                                            </button>
                                        );
                                    }) }
                                </div>
                            </div>
                        ) }
                    </div>
                </div>
            ) }

            { focusedWeather && (
                <div className="absolute bottom-[7.5rem] right-4 z-30 max-w-[min(340px,46vw)]">
                    <div className="relative bg-[rgba(3,5,10,0.88)] px-3 py-2">
                        <div
                            className="text-[9px] font-medium uppercase tracking-wide"
                            style={ { color: LABEL } }
                        >
                            Threat lock
                        </div>
                        <div
                            className="mt-1 text-[11px] font-medium text-white"
                        >
                            { focusedWeather.name }
                        </div>
                        <div className="mt-2 text-[9px]" style={ { color: LABEL } }>
                            SEVERITY:{ ' ' }
                            <span style={ { color: TEAL } }>{ focusedWeather.severity }</span>
                        </div>
                        { (globeLinkHighlights.satellitesAffected.length > 0
                            || globeLinkHighlights.satellitesPotential.length > 0) && (
                            <div className="mt-3 border-t border-[#14B8A6]/15 pt-2">
                                <div
                                    className="mb-1 text-[8px] font-medium uppercase tracking-wide"
                                    style={ { color: LABEL } }
                                >
                                    Linked catalog objects
                                </div>
                                <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
                                    { globeLinkHighlights.satellitesAffected.map((name) => (
                                        <button
                                            key={ `sa-${name}` }
                                            type="button"
                                            className="pointer-events-auto border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide"
                                            style={ {
                                                borderColor: 'rgba(248,113,113,0.55)',
                                                color: '#FCA5A5',
                                                background: 'rgba(40,10,10,0.5)',
                                            } }
                                            onClick={ () => {
                                                const sat = useMissionStore
                                                    .getState()
                                                    .satellites.find((s) => s.name === name);
                                                if (sat) focusSatellite(sat);
                                            } }
                                        >
                                            { name }
                                        </button>
                                    )) }
                                    { globeLinkHighlights.satellitesPotential.map((name) => (
                                        <button
                                            key={ `sp-${name}` }
                                            type="button"
                                            className="pointer-events-auto border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide"
                                            style={ {
                                                borderColor: 'rgba(245,158,11,0.45)',
                                                color: '#FCD34D',
                                                background: 'rgba(40,30,8,0.45)',
                                            } }
                                            onClick={ () => {
                                                const sat = useMissionStore
                                                    .getState()
                                                    .satellites.find((s) => s.name === name);
                                                if (sat) focusSatellite(sat);
                                            } }
                                        >
                                            { name }{ ' ' }
                                            <span className="opacity-70">(potential)</span>
                                        </button>
                                    )) }
                                </div>
                            </div>
                        ) }
                    </div>
                </div>
            ) }

            { showZoomHud && (
                <>
                    <HudRule className="pointer-events-none absolute bottom-11 left-1/2 z-30 w-[min(280px,70vw)] max-w-[70vw] -translate-x-1/2" />
                    <button
                        type="button"
                        className="pointer-events-auto absolute bottom-4 left-1/2 z-30 -translate-x-1/2 border-0 bg-transparent px-2 text-center text-[10px]"
                        style={ { color: `${TEAL}aa` } }
                        onMouseDown={ resetView }
                    >
                        <span className="block font-medium uppercase tracking-[0.2em]" style={ { color: TEAL } }>
                            Exit zoom
                        </span>
                        <span className="mt-1 block font-medium" style={ { color: LABEL } }>
                            ALT
                        </span>
                        <span className="mx-1 font-light tabular-nums" style={ { color: TEAL } }>
                            { globeHud.altitudeKm }KM
                        </span>
                        <span style={ { color: `${TEAL}55` } }>··</span>
                        <span className="ml-1 font-medium" style={ { color: LABEL } }>
                            ZOOM
                        </span>
                        <span className="ml-1 font-light tabular-nums" style={ { color: TEAL } }>
                            { globeHud.zoomMul }x
                        </span>
                    </button>
                </>
            ) }

            <div className="globe-legend-row legend-row pointer-events-auto z-40 flex max-w-[min(520px,92vw)] flex-col gap-2">
                <HudRule />
                <div className={ `text-[9px] font-medium uppercase tracking-wide ${legendTone}` }>
                    <span className="text-[#C87A1A]">■</span> RADIATION{ ' ' }
                    <span className="text-[#B03030]">■</span> DEBRIS{ ' ' }
                    <span className="text-[#A05020]">■</span> DRAG{ ' ' }
                    <span style={ { color: `${TEAL}99` } }>□</span> NOMINAL
                </div>
            </div>
        </div>
    );
}
