import type { CatalogSatellite } from '../data/satelliteRegistry';
import type { SimCinematicEvent } from '../mocks/simCinematicEvents';

const TE = '#14B8A6';
const RED = '#f87171';
const MUTED = '#94a3b8';

function intelCard(inner: string): string {
    return `
<div style="font-family:ui-monospace,monospace;font-size:10px;line-height:1.35;color:${MUTED};max-width:220px;text-align:left;">
  <div style="position:relative;padding:10px 12px;border:1px solid rgba(248,113,113,0.45);background:rgba(3,5,10,0.88);box-shadow:0 0 20px rgba(248,113,113,0.15);">
    ${inner}
  </div>
</div>`.trim();
}

export function buildAssetRiskOverlayHtml(sat: CatalogSatellite, ev: SimCinematicEvent): string {
    const corridor = `T-${Math.max(1, Math.round(ev.impactHours))}H`;
    const inner = `
    <div style="color:${RED};font-weight:600;letter-spacing:0.12em;margin-bottom:6px;">⚠ ASSET AT RISK</div>
    <div style="color:#fff;font-weight:600;font-size:11px;margin-bottom:4px;">${sat.id}</div>
    <div style="color:${MUTED};margin-bottom:2px;">THREAT: ${ev.name.toUpperCase()}</div>
    <div style="color:${MUTED};margin-bottom:2px;">CORRIDOR CROSSING: ${corridor}</div>
    <div style="color:${RED};font-weight:600;">STATUS: ${ev.severity}</div>
    `;
    return intelCard(inner);
}

export function buildThreatIntelOverlayHtml(ev: SimCinematicEvent): string {
    if (ev.type === 'CONJUNCTION') {
        const inner = `
        <div style="color:${TE};font-weight:600;letter-spacing:0.14em;margin-bottom:6px;">DEBRIS FIELD ${ev.name.toUpperCase()}</div>
        <div style="color:${MUTED};margin-bottom:2px;">ORIGIN: IRIDIUM COLLISION 2009</div>
        <div style="color:${MUTED};margin-bottom:2px;">OBJECTS: ${ev.debrisObjects ?? 847} TRACKED</div>
        <div style="color:${MUTED};margin-bottom:2px;">VELOCITY: 7.8 KM/S</div>
        <div style="color:${RED};font-weight:600;">INTERCEPT: T-${Math.max(1, Math.round(ev.impactHours))}H</div>
        `;
        return intelCard(inner);
    }
    const inner = `
    <div style="color:${TE};font-weight:600;letter-spacing:0.14em;margin-bottom:6px;">${ev.name.toUpperCase()}</div>
    <div style="color:${MUTED};margin-bottom:2px;">CLASS: ${ev.radiationLevel ?? 'X8.2'}</div>
    <div style="color:${MUTED};margin-bottom:2px;">VELOCITY: 1,400 KM/S</div>
    <div style="color:${MUTED};margin-bottom:2px;">PARTICLE FLUX: ${ev.protonFlux ?? 'S4'}</div>
    <div style="color:${RED};font-weight:600;">ORBITAL INTERCEPT: T-${Math.max(1, Math.round(ev.impactHours))}H</div>
    `;
    return intelCard(inner);
}
