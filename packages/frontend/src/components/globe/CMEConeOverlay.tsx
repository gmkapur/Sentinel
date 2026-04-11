import { useMemo } from 'react';
import type { FlarePathPrediction, CMEEarthDirectedness } from '@sentinel/shared/src/types';
import { useEarthDirectedPredictions } from '../../stores/missionStore';

interface ConePolygon {
    id: string;
    directedness: CMEEarthDirectedness;
    geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}

/**
 * Generate a spherical cap polygon (GeoJSON) from a center point + half-angle.
 * The cone is projected onto the Earth's surface as a circle in lat/lng space.
 */
function generateConePolygon(
    centerLat: number,
    centerLng: number,
    halfAngleDeg: number,
    segments = 64,
): [number, number][] {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const lat1 = centerLat * toRad;
    const lng1 = centerLng * toRad;
    const angularRadius = halfAngleDeg * toRad;

    const points: [number, number][] = [];
    for (let i = 0; i <= segments; i++) {
        const bearing = (2 * Math.PI * i) / segments;

        const lat2 = Math.asin(
            Math.sin(lat1) * Math.cos(angularRadius) +
                Math.cos(lat1) * Math.sin(angularRadius) * Math.cos(bearing),
        );
        const lng2 =
            lng1 +
            Math.atan2(
                Math.sin(bearing) * Math.sin(angularRadius) * Math.cos(lat1),
                Math.cos(angularRadius) - Math.sin(lat1) * Math.sin(lat2),
            );

        points.push([lng2 * toDeg, lat2 * toDeg]);
    }

    return points;
}

export function useCMEConePolygons(): ConePolygon[] {
    const predictions = useEarthDirectedPredictions();

    return useMemo(() => {
        return predictions.map((pred: FlarePathPrediction) => ({
            id: pred.id,
            directedness: pred.earthDirectedness,
            geometry: {
                type: 'Polygon' as const,
                coordinates: [
                    generateConePolygon(
                        pred.coneLatitude,
                        pred.coneLongitude,
                        pred.coneHalfAngle,
                    ),
                ],
            },
        }));
    }, [predictions]);
}

export function getConeColor(directedness: CMEEarthDirectedness): string {
    switch (directedness) {
        case 'DIRECT_HIT':
            return 'rgba(239, 68, 68, 0.35)';
        case 'GLANCING':
            return 'rgba(245, 158, 11, 0.25)';
        case 'MISS':
            return 'rgba(156, 163, 175, 0.15)';
    }
}

export function getConeSideColor(directedness: CMEEarthDirectedness): string {
    switch (directedness) {
        case 'DIRECT_HIT':
            return 'rgba(239, 68, 68, 0.6)';
        case 'GLANCING':
            return 'rgba(245, 158, 11, 0.4)';
        case 'MISS':
            return 'rgba(156, 163, 175, 0.3)';
    }
}
