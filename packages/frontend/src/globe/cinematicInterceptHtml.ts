const TEAL = '#14B8A6';

export type OrbitalInterceptMarkerState = {
    lat: number;
    lng: number;
    altitude: number;
    opacity: number;
    showRings: boolean;
};

/** HTML marker in orbital space: concentric rings only (no corner brackets). */
export function buildOrbitalInterceptMarkerHtml(m: OrbitalInterceptMarkerState): string {
    const ringOp = m.showRings ? m.opacity : 0;
    return `
<div style="position:relative;width:112px;height:112px;pointer-events:none;user-select:none;opacity:${m.opacity};">
  <div style="position:absolute;inset:8px;border-radius:50%;border:1px solid ${TEAL};opacity:${ringOp * 0.55};box-shadow:0 0 12px ${TEAL}44;"></div>
  <div style="position:absolute;inset:22px;border-radius:50%;border:1px solid ${TEAL};opacity:${ringOp * 0.85};box-shadow:0 0 8px ${TEAL}33;"></div>
</div>`.trim();
}

export function orbitAltitudeToGlobeAlt(orbitAltitudeKm: number, earthRadiusKm: number): number {
    return orbitAltitudeKm / earthRadiusKm;
}
