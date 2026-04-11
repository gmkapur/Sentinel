import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import Globe from 'react-globe.gl';
import { useMissionStore } from '../../stores/missionStore';
import { getAltitudeColor, getRiskLevelColor, RISK_COLORS } from '../../utils/colors';
import { EARTH_RADIUS_KM } from '../../utils/constants';
import { SatelliteTooltip } from './SatelliteTooltip';
import { SatelliteDetailPanel } from '../satellite/SatelliteDetailPanel';
import type { SatPosition, RiskLevel } from '@sentinel/shared/src/types';

type ColorMode = 'risk' | 'altitude';

export function GlobeView() {
    const satellites = useMissionStore((s) => s.satellites);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const globeRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
    const [hoveredSat, setHoveredSat] = useState<SatPosition | null>(null);
    const [selectedSat, setSelectedSat] = useState<SatPosition | null>(null);
    const [colorMode, setColorMode] = useState<ColorMode>('risk');

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

    const pointColor = useCallback(
        (d: object) => {
            const sat = d as SatPosition;
            return colorMode === 'risk'
                ? getRiskLevelColor(sat.riskLevel)
                : getAltitudeColor(sat.alt);
        },
        [colorMode],
    );

    const pointRadius = useCallback(
        (d: object) => {
            if (colorMode !== 'risk') return 0.25;
            const sat = d as SatPosition;
            switch (sat.riskLevel) {
            case 'CRITICAL': return 0.45;
            case 'HIGH': return 0.35;
            case 'MODERATE': return 0.25;
            default: return 0.15;
            }
        },
        [colorMode],
    );

    const handlePointHover = useCallback(
        (point: object | null) => {
            setHoveredSat(point as SatPosition | null);
        },
        [],
    );

    const handlePointClick = useCallback(
        (point: object) => {
            setSelectedSat(point as SatPosition);
        },
        [],
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
            ref={ containerRef }
            className="relative overflow-hidden bg-void"
            onMouseDown={ handleInteraction }
            onWheel={ handleInteraction }
        >
            { dimensions.width > 0 && (
                <Globe
                    ref={ globeRef }
                    width={ dimensions.width }
                    height={ dimensions.height }
                    globeImageUrl={ globeImageUrl }
                    backgroundImageUrl={ bgImageUrl }
                    atmosphereColor="#1a3a5c"
                    atmosphereAltitude={ 0.15 }
                    pointsData={ satellites }
                    pointLat="lat"
                    pointLng="lng"
                    pointAltitude={ pointAlt }
                    pointColor={ pointColor }
                    pointRadius={ pointRadius }
                    pointResolution={ 6 }
                    pointsMerge={ false }
                    onPointHover={ handlePointHover }
                    onPointClick={ handlePointClick }
                    animateIn={ false }
                />
            ) }

            {/* Color mode toggle + legend */}
            <div className="absolute bottom-4 left-4 z-10 flex items-center gap-3">
                <button
                    onClick={ () => setColorMode((m) => (m === 'risk' ? 'altitude' : 'risk')) }
                    className="glass-panel px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-text-secondary hover:text-accent transition-colors cursor-pointer"
                >
                    { colorMode === 'risk' ? 'Risk' : 'Altitude' }
                </button>
                <div className="flex items-center gap-2">
                    { legendItems.map((item) => (
                        <span
                            key={ item.label }
                            className="flex items-center gap-1 font-mono text-[10px] text-text-muted"
                        >
                            <span
                                className="w-1.5 h-1.5 rounded-full inline-block"
                                style={ { backgroundColor: item.color } }
                            />
                            { item.label }
                        </span>
                    )) }
                </div>
            </div>

            { hoveredSat && (
                <div className="absolute top-4 right-4 z-10">
                    <SatelliteTooltip satellite={ hoveredSat } />
                </div>
            ) }

            { selectedSat && (
                <SatelliteDetailPanel
                    satellite={ selectedSat }
                    onClose={ () => setSelectedSat(null) }
                />
            ) }
        </div>
    );
}
