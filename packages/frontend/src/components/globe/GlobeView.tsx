import {
    useRef,
    useEffect,
    useState,
    useCallback,
    useMemo,
    forwardRef,
    useImperativeHandle,
} from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import {
    useMissionStore,
    type CinematicThreatVisual,
} from '../../stores/missionStore';
import {
    animateSatelliteAttackPlasma,
    buildSatelliteAsset,
    buildThreatAssetLibrary,
    clearSatelliteAttackPlasma,
    ensureSatelliteAttackPlasma,
    runThreatChildAnimate,
} from '../../globe/threatAndSatelliteAssets';
import { EARTH_RADIUS_KM } from '../../utils/constants';
import type { SatPosition } from '@sentinel/shared/src/types';

export const DEFAULT_GLOBE_POV = { lat: 18, lng: 0, altitude: 2.5 };
const DEFAULT_POV = DEFAULT_GLOBE_POV;
/** Brighter optical basemap (replaces night texture). */
const TEX_OPTICAL =
    'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';

const NO_ARCS: unknown[] = [];

let satellitePointTexture: THREE.CanvasTexture | null = null;
/** Crisp circular sprite (no soft halo) so points read as discs, not white squares / ovals. */
function getSatellitePointTexture(): THREE.CanvasTexture {
    if (satellitePointTexture) return satellitePointTexture;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx) {
        ctx.clearRect(0, 0, size, size);
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size * 0.24, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    satellitePointTexture = new THREE.CanvasTexture(canvas);
    satellitePointTexture.minFilter = THREE.LinearFilter;
    satellitePointTexture.magFilter = THREE.LinearFilter;
    return satellitePointTexture;
}

const SUN_THREAT_KEYS: ReadonlySet<CinematicThreatVisual> = new Set([
    'SOLAR_STORM',
    'EXTREME_CME',
    'SOLAR_FLARE_XCLASS',
    'SOLAR_FLARE_MCLASS',
    'CME_STANDARD',
    'CME_HALO',
    'CME_CORONAGRAPH',
    'CME_COMPOSITE',
    'SOLAR_ENERGETIC_PARTICLE',
    'PROTON_FLUX',
]);

const EARTH_THREAT_KEYS: ReadonlySet<CinematicThreatVisual> = new Set([
    'GEOMAGNETIC_STORM_G3',
    'GEOMAGNETIC_STORM_G4',
    'GEOMAGNETIC_STORM_G5',
    'MAGNETOSPHERE_COMPRESSION',
    'ATMOSPHERIC_DRAG',
    'RADIATION_BELT',
]);

/** Sun-side framing tweaks per threat slot (local asset units are large). */
const SUN_THREAT_LAYOUT: Partial<
    Record<CinematicThreatVisual, { lat: number; lng: number; alt: number; scale: number }>
> = {
    SOLAR_STORM: { lat: 14, lng: -102, alt: 0.52, scale: 0.32 },
    EXTREME_CME: { lat: 12, lng: -98, alt: 0.54, scale: 0.34 },
    CME_COMPOSITE: { lat: 14, lng: -102, alt: 0.52, scale: 0.34 },
    CME_HALO: { lat: 12, lng: -98, alt: 0.54, scale: 0.36 },
    CME_CORONAGRAPH: { lat: 16, lng: -105, alt: 0.5, scale: 0.3 },
    SOLAR_FLARE_XCLASS: { lat: 14, lng: -102, alt: 0.51, scale: 0.33 },
    SOLAR_FLARE_MCLASS: { lat: 13, lng: -100, alt: 0.53, scale: 0.32 },
    CME_STANDARD: { lat: 13, lng: -100, alt: 0.53, scale: 0.32 },
    SOLAR_ENERGETIC_PARTICLE: { lat: 11, lng: -96, alt: 0.5, scale: 0.28 },
    PROTON_FLUX: { lat: 11, lng: -96, alt: 0.5, scale: 0.28 },
};

const DEFAULT_SUN_THREAT_LAYOUT = {
    lat: 14,
    lng: -102,
    alt: 0.52,
    scale: 0.32,
} as const;

export type GlobeViewHandle = {
    pointOfView: (
        opts: { lat?: number; lng?: number; altitude?: number },
        ms?: number
    ) => void;
    resetPov: (ms?: number) => void;
    getPov: () => { lat: number; lng: number; altitude: number } | null;
    getCoords: (
        lat: number,
        lng: number,
        altitude?: number
    ) => { x: number; y: number; z: number } | null;
    toGeoCoords: (
        pos: THREE.Vector3 | { x: number; y: number; z: number }
    ) => { lat: number; lng: number; altitude: number } | null;
    getScreenCoords: (
        lat: number,
        lng: number,
        altitude?: number
    ) => { x: number; y: number } | null;
    /** Camera to orbital point (lat/lng + normalized altitude above globe). */
    flyToOrbitalSatellite: (
        _name: string,
        fallback: { lat: number; lng: number; altitudeKm: number },
        opts?: { altBump?: number; ms?: number }
    ) => void;
};

type GlobeViewProps = {
    className?: string;
    onSatelliteClick?: (sat: SatPosition) => void;
    onWeatherEventClick?: (eventId: string) => void;
};

type SatelliteCloudDatum = {
    layer: 'SAT_CLOUD';
    id: string;
};

type ThreatLibDatum = {
    layer: 'THREAT_LIB';
    id: string;
};

type SatelliteDetailDatum = {
    layer: 'SAT_DETAIL';
    id: string;
    name: string;
};

type CustomDatum = ThreatLibDatum | SatelliteCloudDatum | SatelliteDetailDatum;

function baseRgbForSatellite(sat: SatPosition): [number, number, number] {
    if (sat.registryClass === 'DEBRIS') return [0.7, 0.1, 0.1];
    if (sat.registryClass === 'STATION') return [0.08, 0.95, 0.85];
    return [1, 1, 1];
}

function buildSatellitePointCloud(n: number): THREE.Points {
    const positions = new Float32Array(Math.max(1, n) * 3);
    const colors = new Float32Array(Math.max(1, n) * 3);
    colors.fill(1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setDrawRange(0, n);
    const mat = new THREE.PointsMaterial({
        map: getSatellitePointTexture(),
        size: 3,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        sizeAttenuation: true,
        depthWrite: false,
        alphaTest: 0.12,
    });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return pts;
}

export const GlobeView = forwardRef<GlobeViewHandle, GlobeViewProps>(
    function GlobeView({ className, onSatelliteClick, onWeatherEventClick }, ref) {
        const satellites = useMissionStore((s) => s.satellites);
        const cmeSatellitesRed = useMissionStore((s) => s.cmeSatellitesRed);
        const cmeSatellitesWhiteFlash = useMissionStore(
            (s) => s.cmeSatellitesWhiteFlash
        );
        const cinematicHtmlAnchors = useMissionStore((s) => s.cinematicHtmlAnchors);
        const cinematicActiveCard = useMissionStore((s) => s.cinematicActiveCard);
        const cinematicArcPulse = useMissionStore((s) => s.cinematicArcPulse);
        const cinematicThreatAnchor = useMissionStore((s) => s.cinematicThreatAnchor);
        const cinematicAtmosphereExpand = useMissionStore(
            (s) => s.cinematicAtmosphereExpand
        );
        const cinematicDetailSatelliteName = useMissionStore(
            (s) => s.cinematicDetailSatelliteName
        );
        const zoomState = useMissionStore((s) => s.zoomState);
        const selectedAssetName = useMissionStore((s) => s.selectedAsset?.name ?? null);
        const globeDetailSatelliteName =
            cinematicDetailSatelliteName
            ?? (zoomState === 'ASSET_LOCK' && selectedAssetName ? selectedAssetName : null);
        const tacticalLinkArcs = useMissionStore((s) => s.tacticalLinkArcs);
        const orbitPathOriginal = useMissionStore((s) => s.orbitPathOriginal);
        const orbitPathSuggested = useMissionStore((s) => s.orbitPathSuggested);
        const weatherCatalogDots = useMissionStore((s) => s.weatherCatalogDots);
        const globeDriftFrozen = useMissionStore((s) => s.globeDriftFrozen);
        const globeLinkHighlights = useMissionStore((s) => s.globeLinkHighlights);
        const focusedWeatherEventId = useMissionStore((s) => s.focusedWeatherEventId);
        const activeThreatTriangles = useMissionStore((s) => s.activeThreatTriangles);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const globeRef = useRef<any>(null);
        const satellitesRef = useRef<SatPosition[]>([]);
        satellitesRef.current = satellites;
        const containerRef = useRef<HTMLDivElement>(null);
        const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
        const hudTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
        const globeInitRef = useRef(false);
        const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
        const setGlobeHud = useMissionStore((s) => s.setGlobeHud);
        const mouseDownPosRef = useRef<{ x: number; y: number } | null>(null);

        useImperativeHandle(ref, () => ({
            pointOfView: (opts, ms = 0) => {
                globeRef.current?.pointOfView(opts, ms);
            },
            resetPov: (ms = 600) => {
                globeRef.current?.pointOfView(DEFAULT_POV, ms);
            },
            getPov: () => {
                try {
                    const cur = globeRef.current?.pointOfView?.();
                    if (
                        cur &&
                        typeof cur.lat === 'number' &&
                        typeof cur.lng === 'number' &&
                        typeof cur.altitude === 'number'
                    ) {
                        return cur;
                    }
                }
                catch {
                    /* noop */
                }
                return null;
            },
            getCoords: (lat, lng, altitude = 0) => {
                try {
                    return globeRef.current?.getCoords?.(lat, lng, altitude) ?? null;
                }
                catch {
                    return null;
                }
            },
            toGeoCoords: (pos) => {
                try {
                    const p =
                        pos instanceof THREE.Vector3
                            ? { x: pos.x, y: pos.y, z: pos.z }
                            : pos;
                    const g = globeRef.current?.toGeoCoords?.(p);
                    if (
                        g
                        && typeof g.lat === 'number'
                        && typeof g.lng === 'number'
                        && typeof g.altitude === 'number'
                    ) {
                        return g;
                    }
                }
                catch {
                    /* noop */
                }
                return null;
            },
            getScreenCoords: (lat, lng, altitude = 0) => {
                try {
                    const s = globeRef.current?.getScreenCoords?.(lat, lng, altitude);
                    if (s && typeof s.x === 'number' && typeof s.y === 'number') {
                        return { x: s.x, y: s.y };
                    }
                }
                catch {
                    /* noop */
                }
                return null;
            },
            flyToOrbitalSatellite: (_name, fallback, opts) => {
                const gl = globeRef.current;
                if (!gl) return;
                const bump = opts?.altBump ?? 0.25;
                const ms = opts?.ms ?? 2000;
                const rel = fallback.altitudeKm / EARTH_RADIUS_KM;
                gl.pointOfView(
                    {
                        lat: fallback.lat,
                        lng: fallback.lng,
                        altitude: rel + bump,
                    },
                    ms
                );
            },
        }));

        useEffect(() => {
            const el = containerRef.current;
            if (!el) return;

            const observer = new ResizeObserver((entries) => {
                const { width, height } = entries[0].contentRect;
                setDimensions({ width, height });
            });
            observer.observe(el);
            return () => observer.disconnect();
        }, []);

        useEffect(() => {
            if (!globeRef.current || dimensions.width <= 0) return;
            const controls = globeRef.current.controls();
            controls.autoRotateSpeed = 0.3;
            controls.enableDamping = true;
            controls.dampingFactor = 0.1;
            controls.zoomSpeed = 0.55;
            if (!globeInitRef.current) {
                globeInitRef.current = true;
                globeRef.current.pointOfView(DEFAULT_POV, 0);
            }
            controls.autoRotate = !globeDriftFrozen;
        }, [dimensions.width, globeDriftFrozen]);

        const refreshHud = useCallback(() => {
            const pov = globeRef.current?.pointOfView?.();
            if (!pov || typeof pov.altitude !== 'number') return;
            const altKm = Math.round(
                Math.max(120, Math.min(42000, pov.altitude * 4200 + 200))
            );
            const zoomMul = Math.min(
                12,
                Math.max(1, Number((2.8 / Math.max(0.12, pov.altitude)).toFixed(2)))
            );
            setGlobeHud({ altitudeKm: altKm, zoomMul });
        }, [setGlobeHud]);

        useEffect(() => {
            hudTimerRef.current = setInterval(refreshHud, 200);
            return () => {
                if (hudTimerRef.current) clearInterval(hudTimerRef.current);
            };
        }, [refreshHud]);

        const handleInteraction = useCallback(() => {
            if (!globeRef.current) return;
            if (useMissionStore.getState().globeDriftFrozen) {
                refreshHud();
                return;
            }
            const controls = globeRef.current.controls();
            controls.autoRotate = false;

            if (idleTimerRef.current) {
                clearTimeout(idleTimerRef.current);
            }
            idleTimerRef.current = setTimeout(() => {
                if (globeRef.current && !useMissionStore.getState().globeDriftFrozen) {
                    globeRef.current.controls().autoRotate = true;
                }
            }, 5000);
            refreshHud();
        }, [refreshHud]);

        const handleContainerMouseDown = useCallback(
            (e: React.MouseEvent) => {
                mouseDownPosRef.current = { x: e.clientX, y: e.clientY };
                handleInteraction();
            },
            [handleInteraction]
        );

        const handleContainerMouseUp = useCallback(
            (e: React.MouseEvent) => {
                const down = mouseDownPosRef.current;
                mouseDownPosRef.current = null;
                if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;

                const gl = globeRef.current;
                const el = containerRef.current;
                if (!gl || !el) return;
                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                let closestSat: SatPosition | null = null;
                let closestDist = Infinity;

                for (const sat of satellitesRef.current) {
                    const relAlt = sat.alt / EARTH_RADIUS_KM;
                    try {
                        const sc = gl.getScreenCoords(sat.lat, sat.lng, relAlt);
                        if (!sc || !Number.isFinite(sc.x) || !Number.isFinite(sc.y)) continue;
                        const dist = Math.hypot(sc.x - mx, sc.y - my);
                        if (dist < closestDist) {
                            closestDist = dist;
                            closestSat = sat;
                        }
                    }
                    catch {
                        /* noop */
                    }
                }

                if (closestSat && closestDist < 18) {
                    if (onSatelliteClick) {
                        onSatelliteClick(closestSat);
                    }
                    else {
                        const relAlt = closestSat.alt / EARTH_RADIUS_KM;
                        gl.pointOfView(
                            {
                                lat: closestSat.lat,
                                lng: closestSat.lng,
                                altitude: relAlt + 0.25,
                            },
                            1000
                        );
                    }
                }
            },
            [onSatelliteClick]
        );

        const handleContainerMouseMove = useCallback(
            (e: React.MouseEvent) => {
                const gl = globeRef.current;
                const el = containerRef.current;
                if (!gl || !el) return;
                const rect = el.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;

                for (const sat of satellitesRef.current) {
                    const relAlt = sat.alt / EARTH_RADIUS_KM;
                    try {
                        const sc = gl.getScreenCoords(sat.lat, sat.lng, relAlt);
                        if (
                            sc
                            && Number.isFinite(sc.x)
                            && Number.isFinite(sc.y)
                            && Math.hypot(sc.x - mx, sc.y - my) < 18
                        ) {
                            el.style.cursor = 'pointer';
                            return;
                        }
                    }
                    catch {
                        /* noop */
                    }
                }
                el.style.cursor = '';
            },
            []
        );

        const orbitShellLabels = useMemo(
            () => [
                {
                    id: 'shell-leo',
                    lat: 10,
                    lng: 52,
                    altitude: ((400 + 2000) / 2) / EARTH_RADIUS_KM,
                    html: `<div style="font-family:ui-monospace,monospace;font-size:8px;opacity:0.24;color:#14b8a6;white-space:nowrap;text-shadow:0 0 6px rgba(3,5,10,0.9)">LEO ·· 400 TO 2,000 KM</div>`,
                },
                {
                    id: 'shell-meo',
                    lat: -22,
                    lng: -118,
                    altitude: 22100 / EARTH_RADIUS_KM,
                    html: `<div style="font-family:ui-monospace,monospace;font-size:8px;opacity:0.22;color:#14b8a6;white-space:nowrap;text-shadow:0 0 6px rgba(3,5,10,0.9)">MEO ·· ~20,000 KM</div>`,
                },
                {
                    id: 'shell-geo',
                    lat: 1.5,
                    lng: -38,
                    altitude: 35786 / EARTH_RADIUS_KM,
                    html: `<div style="font-family:ui-monospace,monospace;font-size:8px;opacity:0.2;color:#14b8a6;white-space:nowrap;text-shadow:0 0 6px rgba(3,5,10,0.9)">GEO ·· 35,786 KM</div>`,
                },
            ],
            []
        );

        const weatherEventMarkers = useMemo(
            () =>
                activeThreatTriangles.map((evt) => ({
                    id: `wx-marker-${evt.id}`,
                    wxId: evt.id,
                    type: 'weather-event' as const,
                    lat: evt.lat,
                    lng: evt.lng,
                    altitude: 0.015,
                    name: evt.name,
                    severity: evt.severity,
                    linkTier:
                        globeLinkHighlights.weatherAffected.includes(evt.id)
                            ? ('affected' as const)
                            : globeLinkHighlights.weatherPotential.includes(evt.id)
                              ? ('potential' as const)
                              : null,
                    isFocused: focusedWeatherEventId === evt.id,
                })),
            [
                activeThreatTriangles,
                focusedWeatherEventId,
                globeLinkHighlights.weatherAffected,
                globeLinkHighlights.weatherPotential,
            ]
        );

        const htmlElementsData = useMemo(() => {
            const threatAnchors =
                cinematicActiveCard === 'threat'
                    ? cinematicHtmlAnchors.map((a) => ({
                        id: a.id,
                        lat: a.lat,
                        lng: a.lng,
                        altitude: a.altitude,
                        html: a.html,
                    }))
                    : [];
            return [...orbitShellLabels, ...threatAnchors, ...weatherEventMarkers];
        }, [cinematicActiveCard, cinematicHtmlAnchors, orbitShellLabels, weatherEventMarkers]);

        const arcsData = useMemo(() => {
            const rows: unknown[] = [...tacticalLinkArcs];
            if (cinematicArcPulse) rows.push(cinematicArcPulse);
            return rows.length ? rows : (NO_ARCS as never[]);
        }, [tacticalLinkArcs, cinematicArcPulse]);

        type PathRow = {
            id: string;
            coords: [number, number, number][];
            color: string;
            dashL: number;
            dashG: number;
        };

        const pathsData = useMemo((): PathRow[] => {
            const rows: PathRow[] = [];
            if (orbitPathOriginal?.length) {
                rows.push({
                    id: 'orbit-orig',
                    coords: orbitPathOriginal.map((p) => [p.lat, p.lng, p.alt]),
                    color: 'rgba(232, 64, 64, 0.42)',
                    dashL: 0.018,
                    dashG: 0.014,
                });
            }
            if (orbitPathSuggested?.length) {
                rows.push({
                    id: 'orbit-suggested',
                    coords: orbitPathSuggested.map((p) => [p.lat, p.lng, p.alt]),
                    color: 'rgba(20, 184, 166, 0.9)',
                    dashL: 1,
                    dashG: 0,
                });
            }
            return rows;
        }, [orbitPathOriginal, orbitPathSuggested]);

        const weatherPointsData = useMemo(
            () => weatherCatalogDots.map((p, i) => ({ ...p, id: `wx-${i}` })),
            [weatherCatalogDots]
        );

        const customLayerData = useMemo((): CustomDatum[] => {
            const rows: CustomDatum[] = [
                { layer: 'SAT_CLOUD', id: 'sat-cloud' },
                { layer: 'THREAT_LIB', id: 'threat-lib' },
            ];
            if (globeDetailSatelliteName) {
                rows.push({
                    layer: 'SAT_DETAIL',
                    id: 'sat-detail',
                    name: globeDetailSatelliteName,
                });
            }
            return rows;
        }, [globeDetailSatelliteName]);

        const customThreeObject = useCallback((d: object) => {
            const row = d as CustomDatum;
            if (row.layer === 'SAT_CLOUD') {
                const n = satellitesRef.current.length || 1;
                return buildSatellitePointCloud(n);
            }
            if (row.layer === 'THREAT_LIB') {
                return buildThreatAssetLibrary();
            }
            return buildSatelliteAsset();
        }, []);

        const customThreeObjectUpdate = useCallback(
            (obj: THREE.Object3D, d: object) => {
                const gl = globeRef.current;
                if (!gl?.getCoords) return;
                const row = d as CustomDatum;
                const t = performance.now() * 0.001;
                const now = performance.now();
                const u = obj.userData as { cinematicDtLast?: number };
                const dt = Math.min(
                    0.08,
                    (now - (u.cinematicDtLast ?? now - 16.67)) / 1000
                );
                u.cinematicDtLast = now;

                if (row.layer === 'SAT_CLOUD') {
                    const pts = obj as THREE.Points;
                    const geo = pts.geometry as THREE.BufferGeometry;
                    const st = useMissionStore.getState();
                    const detailName =
                        st.cinematicDetailSatelliteName
                        ?? (st.zoomState === 'ASSET_LOCK' && st.selectedAsset?.name
                            ? st.selectedAsset.name
                            : null);
                    const satsAll = satellitesRef.current;
                    const sats = detailName
                        ? satsAll.filter((s) => s.name !== detailName)
                        : satsAll;
                    const n = sats.length;
                    if (n === 0) return;

                    let posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
                    let colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
                    if (posAttr.count !== n) {
                        geo.deleteAttribute('position');
                        geo.deleteAttribute('color');
                        const positions = new Float32Array(n * 3);
                        const colors = new Float32Array(n * 3);
                        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
                        posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
                        colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
                        geo.setDrawRange(0, n);
                    }

                    const pos = posAttr.array as Float32Array;
                    const col = colAttr.array as Float32Array;
                    const overlay =
                        st.cinematicActiveCard === 'satellite'
                            ? st.cinematicAssetRiskOverlay
                            : null;
                    const primaryName = overlay?.satelliteName ?? null;

                    for (let i = 0; i < n; i++) {
                        const sat = sats[i];
                        const relAlt = sat.alt / EARTH_RADIUS_KM;
                        const c = gl.getCoords(sat.lat, sat.lng, relAlt);
                        if (c) {
                            pos[i * 3] = c.x;
                            pos[i * 3 + 1] = c.y;
                            pos[i * 3 + 2] = c.z;
                        }

                        const path = sat.id % 6 === 2;
                        const [br, bg, bb] = baseRgbForSatellite(sat);
                        let r = br;
                        let g = bg;
                        let b = bb;

                        if (primaryName && primaryName === sat.name) {
                            const pulse = Math.sin(Date.now() * 0.008) * 0.5 + 0.5;
                            r = 0.72 + pulse * 0.26;
                            g = 0.12 - pulse * 0.1;
                            b = 0.12 - pulse * 0.1;
                        }
                        else if (overlay && sat.name !== primaryName) {
                            r = 1;
                            g = 1;
                            b = 1;
                        }
                        else if (st.globeLinkHighlights.satellitesAffected.includes(sat.name)) {
                            const pulse = Math.sin(Date.now() * 0.008) * 0.5 + 0.5;
                            r = 0.82 + pulse * 0.18;
                            g = 0.18 + pulse * 0.12;
                            b = 0.14;
                        }
                        else if (st.globeLinkHighlights.satellitesPotential.includes(sat.name)) {
                            const pulse = Math.sin(Date.now() * 0.006) * 0.5 + 0.5;
                            r = 0.98;
                            g = 0.52 + pulse * 0.28;
                            b = 0.1;
                        }
                        else if (cmeSatellitesWhiteFlash && path) {
                            r = g = b = 1;
                        }
                        else if (cmeSatellitesRed && path) {
                            r = 0.85;
                            g = 0.22;
                            b = 0.22;
                        }

                        col[i * 3] = r;
                        col[i * 3 + 1] = g;
                        col[i * 3 + 2] = b;
                    }

                    posAttr.needsUpdate = true;
                    colAttr.needsUpdate = true;
                    return;
                }

                if (row.layer === 'THREAT_LIB') {
                    const root = obj as THREE.Group;
                    const st = useMissionStore.getState();
                    const active = st.cinematicThreatVisual;
                    const on =
                        st.simulateRunning && st.cinematicActive && active !== 'NONE';

                    root.children.forEach((ch) => {
                        if (!(ch instanceof THREE.Group)) return;
                        const key = ch.name as CinematicThreatVisual;
                        ch.visible = on && key === active;
                        if (!ch.visible) return;

                        const billboard = Boolean(
                            (ch.userData as { billboard?: boolean }).billboard
                        );
                        const cam = gl.camera?.() as THREE.Camera | undefined;

                        if (SUN_THREAT_KEYS.has(key)) {
                            const L = SUN_THREAT_LAYOUT[key] ?? DEFAULT_SUN_THREAT_LAYOUT;
                            const c = gl.getCoords(L.lat, L.lng, L.alt);
                            if (c) ch.position.set(c.x, c.y, c.z);
                            ch.scale.setScalar(L.scale);
                            runThreatChildAnimate(ch, t);
                            if (billboard && cam) ch.quaternion.copy(cam.quaternion);
                        }
                        else if (EARTH_THREAT_KEYS.has(key)) {
                            const ev = st.cinematicDemoEvent;
                            const lat = ev?.lat ?? 20;
                            const lng = ev?.lng ?? -30;
                            const c = gl.getCoords(lat, lng, 0.09);
                            if (c) ch.position.set(c.x, c.y, c.z);
                            ch.scale.setScalar(0.2);
                            runThreatChildAnimate(ch, t);
                            if (billboard && cam) ch.quaternion.copy(cam.quaternion);
                        }
                        else if (key === 'CONJUNCTION') {
                            const a = cinematicThreatAnchor ?? { lat: 0, lng: 0, alt: 0.02 };
                            const c = gl.getCoords(a.lat, a.lng, a.alt);
                            if (c) ch.position.set(c.x, c.y, c.z);
                            ch.scale.setScalar(0.2);
                            runThreatChildAnimate(ch, t);
                            if (billboard && cam) ch.quaternion.copy(cam.quaternion);
                        }
                    });
                    return;
                }

                if (row.layer === 'SAT_DETAIL') {
                    const name = row.name;
                    const sat = satellitesRef.current.find((s) => s.name === name);
                    if (!sat) return;
                    const relAlt = sat.alt / EARTH_RADIUS_KM;
                    const c = gl.getCoords(sat.lat, sat.lng, relAlt);
                    if (c) obj.position.set(c.x, c.y, c.z);
                    const gr = gl.getGlobeRadius?.() ?? 100;
                    obj.scale.setScalar(0.19 * (gr / 100));

                    const st = useMissionStore.getState();
                    if (!st.cinematicSatelliteRotationPaused && !st.globeDriftFrozen) {
                        obj.rotation.y += dt * ((2 * Math.PI) / 20);
                    }

                    const g = obj as THREE.Group & {
                        assetBody?: THREE.Mesh;
                        assetLight?: THREE.PointLight;
                        panelMaterials?: THREE.MeshBasicMaterial[];
                    };
                    const atRisk = st.cinematicRiskSatelliteNames.includes(name);
                    const attackVisual =
                        atRisk &&
                        (st.threatLevel === 'HIGH' || st.threatLevel === 'CRITICAL');
                    const grp = obj as THREE.Group;
                    if (attackVisual) {
                        ensureSatelliteAttackPlasma(grp);
                        animateSatelliteAttackPlasma(grp, t);
                    }
                    else {
                        clearSatelliteAttackPlasma(grp);
                    }
                    const pulse = Math.sin(Date.now() * 0.008) * 0.5 + 0.5;
                    if (g.assetBody?.material instanceof THREE.MeshBasicMaterial) {
                        if (!attackVisual && atRisk) {
                            g.assetBody.material.color.setRGB(
                                0.79 * (1 - pulse * 0.35) + 0.9 * pulse * 0.35,
                                0.66 * (1 - pulse * 0.55),
                                0.3 * (1 - pulse * 0.55)
                            );
                        }
                        else if (!attackVisual) {
                            g.assetBody.material.color.setHex(0xc9a84c);
                        }
                    }
                    if (g.assetLight) {
                        g.assetLight.intensity = atRisk ? 1.8 + pulse * 1.2 : 0;
                    }
                    const glint = 0.88 + Math.sin(Date.now() * 0.0014) * 0.12;
                    g.panelMaterials?.forEach((m) => {
                        m.color.setRGB(
                            0.08 * glint + 0.04,
                            0.22 * glint + 0.35,
                            0.48 * glint + 0.22
                        );
                    });
                }
            },
            [cinematicThreatAnchor, cmeSatellitesRed, cmeSatellitesWhiteFlash]
        );

        return (
            <div
                ref={ containerRef }
                className={ `globe-container relative h-full w-full overflow-hidden bg-[#030508] ${className ?? ''}` }
                onMouseDown={ handleContainerMouseDown }
                onMouseUp={ handleContainerMouseUp }
                onMouseMove={ handleContainerMouseMove }
                onWheel={ handleInteraction }
            >
                { dimensions.width > 0 && (
                    <Globe
                        ref={ globeRef }
                        width={ dimensions.width }
                        height={ dimensions.height }
                        backgroundColor="#030508"
                        backgroundImageUrl={ null }
                        globeImageUrl={ TEX_OPTICAL }
                        showAtmosphere
                        atmosphereColor="rgba(20, 184, 166, 0.28)"
                        atmosphereAltitude={ cinematicAtmosphereExpand ? 0.42 : 0.22 }
                        showGraticules={ false }
                        arcsData={ arcsData as never[] }
                        arcStartLat="startLat"
                        arcStartLng="startLng"
                        arcEndLat="endLat"
                        arcEndLng="endLng"
                        arcStartAltitude="startAltitude"
                        arcEndAltitude="endAltitude"
                        arcColor={ () =>
                            'rgba(248,113,113,0.75)'
                        }
                        arcStroke={ 0.45 }
                        arcAltitude={ 0.04 }
                        arcsTransitionDuration={ 600 }
                        ringsData={ NO_ARCS as never[] }
                        pathsData={ pathsData as object[] }
                        pathPoints={ (d: object) => (d as PathRow).coords }
                        pathPointLat={ (p: [number, number, number]) => p[0] }
                        pathPointLng={ (p: [number, number, number]) => p[1] }
                        pathPointAlt={ (p: [number, number, number]) => p[2] }
                        pathColor={ (d: object) => (d as PathRow).color }
                        pathDashLength={ (d: object) => (d as PathRow).dashL }
                        pathDashGap={ (d: object) => (d as PathRow).dashG }
                        pathStroke={ null }
                        pathTransitionDuration={ 400 }
                        labelsData={ NO_ARCS as never[] }
                        hexPolygonsData={ NO_ARCS as never[] }
                        hexBinPointsData={ NO_ARCS as never[] }
                        tilesData={ NO_ARCS as never[] }
                        heatmapsData={ NO_ARCS as never[] }
                        particlesData={ NO_ARCS as never[] }
                        objectsData={ NO_ARCS as never[] }
                        customLayerData={ customLayerData as object[] }
                        customThreeObject={ customThreeObject }
                        customThreeObjectUpdate={ customThreeObjectUpdate }
                        polygonsData={ NO_ARCS as never[] }
                        htmlElementsData={ htmlElementsData }
                        htmlLat="lat"
                        htmlLng="lng"
                        htmlAltitude="altitude"
                        htmlElement={ (d: object) => {
                            const data = d as Record<string, unknown>;
                            if (data.type === 'weather-event') {
                                const evtName = data.name as string;
                                const wxId = data.wxId as string;
                                const linkTier = data.linkTier as
                                    | 'affected'
                                    | 'potential'
                                    | null;
                                const isFocused = Boolean(data.isFocused);
                                const el = document.createElement('div');
                                el.style.cursor = 'pointer';
                                el.style.transform = 'translate(-50%, -50%)';
                                el.title = evtName;
                                const ring =
                                    isFocused
                                        ? '0 0 0 3px rgba(20,184,166,0.95), 0 0 18px rgba(20,184,166,0.55)'
                                        : linkTier === 'affected'
                                          ? '0 0 0 2px rgba(248,113,113,0.95), 0 0 14px rgba(248,113,113,0.45)'
                                          : linkTier === 'potential'
                                            ? '0 0 0 2px rgba(245,158,11,0.75), 0 0 12px rgba(245,158,11,0.35)'
                                            : 'none';
                                el.innerHTML = `<div style="border-radius:10px;padding:3px 4px 5px;box-shadow:${ring}"><svg width="22" height="22" viewBox="0 0 22 22" style="filter:drop-shadow(0 0 6px rgba(232,64,64,0.7));display:block;margin:0 auto"><polygon points="11,2 20,20 2,20" fill="#E84040" stroke="#FF6B6B" stroke-width="1.2"/></svg><div style="font-family:ui-monospace,monospace;font-size:7px;color:#ff6b6b;white-space:nowrap;text-align:center;margin-top:2px;text-shadow:0 0 4px rgba(0,0,0,0.9);opacity:0.9">${evtName}</div></div>`;
                                el.addEventListener('click', (ev) => {
                                    ev.stopPropagation();
                                    onWeatherEventClick?.(wxId);
                                });
                                return el;
                            }
                            const el = document.createElement('div');
                            el.innerHTML = (data as { html: string }).html;
                            return el;
                        } }
                        pointsData={ weatherPointsData as object[] }
                        pointLat="lat"
                        pointLng="lng"
                        pointAltitude="alt"
                        pointColor={ () => '#E84040' }
                        pointRadius={ 0.22 }
                        pointsTransitionDuration={ 400 }
                        animateIn={ false }
                        onZoom={ refreshHud }
                    />
                ) }
                <div className="globe-vignette pointer-events-none absolute inset-0 z-[12]" />
            </div>
        );
    }
);
