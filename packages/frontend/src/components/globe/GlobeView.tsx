import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { useMissionStore } from '../../stores/missionStore';
import {
    getAltitudeColor,
    getRiskLevelColor,
    RISK_COLORS,
} from '../../utils/colors';
import { EARTH_RADIUS_KM } from '../../utils/constants';
import { SatelliteTooltip } from './SatelliteTooltip';
import { SatelliteDetailPanel } from '../satellite/SatelliteDetailPanel';
import { useCMEConePolygons, getConeColor, getConeSideColor } from './CMEConeOverlay';
import type { SatPosition, ConjunctionEvent, CMEEarthDirectedness } from '@sentinel/shared/src/types';

type ColorMode = 'risk' | 'altitude';

const CONJUNCTION_ARC_COLORS: Record<string, string> = {
    CRITICAL: '#ef4444',
    WARNING: '#f97316',
    CLOSE_APPROACH: '#eab308',
};

export function GlobeView() {
    const satellites = useMissionStore((s) => s.satellites);
    const conjunctions = useMissionStore((s) => s.conjunctions);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globeRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [hoveredSat, setHoveredSat] = useState<SatPosition | null>(null);
    const [selectedSat, setSelectedSat] = useState<SatPosition | null>(null);
    const [colorMode, setColorMode] = useState<ColorMode>('risk');
    const [showConjunctions, setShowConjunctions] = useState(true);
    const [showCMECones, setShowCMECones] = useState(true);
    const cmePolygons = useCMEConePolygons();

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
        if (!globeRef.current) return;
        const controls = globeRef.current.controls();
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.5;
        controls.enableDamping = true;
        controls.dampingFactor = 0.1;
        globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 2.5 });
    }, []);

    const handleInteraction = useCallback(() => {
        if (!globeRef.current) return;
        const controls = globeRef.current.controls();
        controls.autoRotate = false;

        if (idleTimerRef.current) {
            clearTimeout(idleTimerRef.current);
        }
        idleTimerRef.current = setTimeout(() => {
            if (globeRef.current) {
                globeRef.current.controls().autoRotate = true;
            }
        }, 5000);
    }, []);

    const pointAlt = useCallback(
        (d: object) => (d as SatPosition).alt / EARTH_RADIUS_KM,
        [],
    );

    const handlePointHover = useCallback((point: object | null) => {
        setHoveredSat(point as SatPosition | null);
    }, []);

    const handlePointClick = useCallback((point: object) => {
        setSelectedSat(point as SatPosition);
    }, []);

    // Conjunction arcs — only inter-constellation by default
    const arcData = useMemo(() => {
        if (!showConjunctions) return [];
        return conjunctions.filter((c) => !c.isIntraConstellation);
    }, [conjunctions, showConjunctions]);

    const arcStartLat = useCallback((d: object) => (d as ConjunctionEvent).sat1Position.lat, []);
    const arcStartLng = useCallback((d: object) => (d as ConjunctionEvent).sat1Position.lng, []);
    const arcEndLat = useCallback((d: object) => (d as ConjunctionEvent).sat2Position.lat, []);
    const arcEndLng = useCallback((d: object) => (d as ConjunctionEvent).sat2Position.lng, []);
    const arcColor = useCallback(
        (d: object) => CONJUNCTION_ARC_COLORS[(d as ConjunctionEvent).severity] ?? '#eab308',
        [],
    );
    const arcAltitude = useCallback(() => 0.1, []);
    const arcStroke = useCallback((d: object) => {
        const severity = (d as ConjunctionEvent).severity;
        return severity === 'CRITICAL' ? 1.5 : severity === 'WARNING' ? 1 : 0.5;
    }, []);
    const arcDashGap = useCallback((d: object) => {
        return (d as ConjunctionEvent).severity === 'CRITICAL' ? 0 : 2;
    }, []);

    // CME cone polygon layer
    const polygonData = useMemo(
        () => (showCMECones ? cmePolygons : []),
        [cmePolygons, showCMECones],
    );
    const polygonGeoJson = useCallback(
        (d: object) => (d as { geometry: object }).geometry,
        [],
    );
    const polygonCapColor = useCallback(
        (d: object) => getConeColor((d as { directedness: CMEEarthDirectedness }).directedness),
        [],
    );
    const polygonSideColor = useCallback(
        (d: object) => getConeSideColor((d as { directedness: CMEEarthDirectedness }).directedness),
        [],
    );
    const polygonStrokeColor = useCallback(
        () => 'rgba(239, 68, 68, 0.6)',
        [],
    );
    const polygonAltitude = useCallback(() => 0.01, []);

    // Enhance point radius for CME-affected satellites
    const pointRadiusWithCME = useCallback(
        (d: object) => {
            const sat = d as SatPosition;
            const baseRadius = colorMode !== 'risk'
                ? 0.25
                : sat.riskLevel === 'CRITICAL' ? 0.45
                : sat.riskLevel === 'HIGH' ? 0.35
                : sat.riskLevel === 'MODERATE' ? 0.25
                : 0.15;
            // Enlarge satellites with CME impact
            if (sat.cmeImpactProbability && sat.cmeImpactProbability > 0.5) {
                return baseRadius * 1.5;
            }
            return baseRadius;
        },
        [colorMode],
    );

    // Enhance point color for CME-affected satellites
    const pointColorWithCME = useCallback(
        (d: object) => {
            const sat = d as SatPosition;
            if (sat.cmeImpactProbability && sat.cmeImpactProbability > 0.5) {
                return '#f97316'; // Orange glow for CME-affected
            }
            return colorMode === 'risk'
                ? getRiskLevelColor(sat.riskLevel)
                : getAltitudeColor(sat.alt);
        },
        [colorMode],
    );

    const globeImageUrl = useMemo(
        () => 'https://unpkg.com/three-globe/example/img/earth-night.jpg',
        [],
    );

    const bgImageUrl = useMemo(
        () => 'https://unpkg.com/three-globe/example/img/night-sky.png',
        [],
    );

    const legendItems: Array<{ color: string; label: string }> =
        colorMode === 'risk'
            ? [
                  { color: RISK_COLORS.LOW, label: 'LOW' },
                  { color: RISK_COLORS.MODERATE, label: 'MOD' },
                  { color: RISK_COLORS.HIGH, label: 'HIGH' },
                  { color: RISK_COLORS.CRITICAL, label: 'CRIT' },
              ]
            : [
                  { color: '#22d3ee', label: 'LEO' },
                  { color: '#eab308', label: 'MEO' },
                  { color: '#f97316', label: 'GEO' },
                  { color: '#a855f7', label: 'HEO' },
              ];

    return (
        <div
            ref={containerRef}
            className="relative overflow-hidden bg-void"
            onMouseDown={handleInteraction}
            onWheel={handleInteraction}
        >
            {dimensions.width > 0 && (
                <Globe
                    ref={globeRef}
                    width={dimensions.width}
                    height={dimensions.height}
                    globeImageUrl={globeImageUrl}
                    backgroundImageUrl={bgImageUrl}
                    atmosphereColor="#1a3a5c"
                    atmosphereAltitude={0.15}
                    pointsData={satellites}
                    pointLat="lat"
                    pointLng="lng"
                    pointAltitude={pointAlt}
                    pointColor={pointColorWithCME}
                    pointRadius={pointRadiusWithCME}
                    pointResolution={6}
                    pointsMerge={false}
                    onPointHover={handlePointHover}
                    onPointClick={handlePointClick}
                    arcsData={arcData}
                    arcStartLat={arcStartLat}
                    arcStartLng={arcStartLng}
                    arcEndLat={arcEndLat}
                    arcEndLng={arcEndLng}
                    arcColor={arcColor}
                    arcAltitudeAutoScale={arcAltitude}
                    arcStroke={arcStroke}
                    arcDashGap={arcDashGap}
                    arcDashAnimateTime={1500}
                    polygonsData={polygonData}
                    polygonGeoJsonGeometry={polygonGeoJson}
                    polygonCapColor={polygonCapColor}
                    polygonSideColor={polygonSideColor}
                    polygonStrokeColor={polygonStrokeColor}
                    polygonAltitude={polygonAltitude}
                    animateIn={false}
                />
            )}

            {/* Color mode toggle + legend */}
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3">
                <button
                    onClick={() =>
                        setColorMode((m) =>
                            m === 'risk' ? 'altitude' : 'risk',
                        )
                    }
                    className="glass-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:text-accent transition-colors cursor-pointer"
                >
                    {colorMode === 'risk' ? 'Risk' : 'Altitude'}
                </button>
                <button
                    onClick={() => setShowConjunctions((v) => !v)}
                    className={`glass-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                        showConjunctions
                            ? 'text-accent'
                            : 'text-text-muted hover:text-text-secondary'
                    }`}
                >
                    Conj {showConjunctions ? 'ON' : 'OFF'}
                    {conjunctions.filter((c) => !c.isIntraConstellation).length > 0 && (
                        <span className="ml-1 text-risk-high">
                            ({conjunctions.filter((c) => !c.isIntraConstellation).length})
                        </span>
                    )}
                </button>
                {cmePolygons.length > 0 && (
                    <button
                        onClick={() => setShowCMECones((v) => !v)}
                        className={`glass-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors cursor-pointer ${
                            showCMECones
                                ? 'text-risk-critical'
                                : 'text-text-muted hover:text-text-secondary'
                        }`}
                    >
                        CME {showCMECones ? 'ON' : 'OFF'}
                        <span className="ml-1 text-risk-critical">
                            ({cmePolygons.length})
                        </span>
                    </button>
                )}
                <div className="flex items-center gap-2">
                    {legendItems.map((item) => (
                        <span
                            key={item.label}
                            className="flex items-center gap-1 font-mono text-[10px] text-text-muted"
                        >
                            <span
                                className="w-1.5 h-1.5 rounded-full inline-block"
                                style={{ backgroundColor: item.color }}
                            />
                            {item.label}
                        </span>
                    ))}
                </div>
            </div>

            {hoveredSat && (
                <div className="absolute top-4 right-4 z-10">
                    <SatelliteTooltip satellite={hoveredSat} />
                </div>
            )}

            {selectedSat && (
                <SatelliteDetailPanel
                    satellite={selectedSat}
                    onClose={() => setSelectedSat(null)}
                />
            )}
        </div>
    );
}
