import { EARTH_RADIUS_KM } from '../utils/constants';

export type OrbitPathPoint = { lat: number; lng: number; alt: number };

/** Closed path for globe.gl: `alt` is normalized altitude (km / Earth radius). */
export function generateInclinedOrbitPath(
    anchorLat: number,
    anchorLng: number,
    altitudeKm: number,
    inclinationDeg: number,
    segments = 128
): OrbitPathPoint[] {
    const alt = altitudeKm / EARTH_RADIUS_KM;
    const inc = (inclinationDeg * Math.PI) / 180;
    const pts: OrbitPathPoint[] = [];
    for (let i = 0; i <= segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const lat = anchorLat + (180 / Math.PI) * Math.sin(a) * Math.sin(inc) * 0.42;
        const lng = anchorLng + (a * 180) / Math.PI;
        const wrapLng = ((lng + 540) % 360) - 180;
        pts.push({
            lat: Math.max(-85, Math.min(85, lat)),
            lng: wrapLng,
            alt,
        });
    }
    return pts;
}
