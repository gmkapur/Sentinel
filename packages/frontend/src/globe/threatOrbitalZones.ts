import type { ActiveThreat, UiThreatLevel } from '../stores/missionStore';

export type ThreatPolygon = {
    id: string;
    geometry: { type: 'Polygon'; coordinates: number[][][] };
    capColor: string;
    alt: number;
};

export interface ThreatHtmlLabel {
    id: string;
    lat: number;
    lng: number;
    altitude: number;
    title: string;
    subtitle: string;
    color: string;
}

const SOLAR = 'rgba(200, 122, 26, 0.6)';
const DEBRIS = 'rgba(176, 48, 48, 0.55)';
const DRAG = 'rgba(160, 80, 32, 0.45)';
const BELT = 'rgba(139, 105, 20, 0.4)';

/** GeoJSON Polygon exterior ring: [lng, lat][] */
function ringRect(
    west: number,
    east: number,
    south: number,
    north: number
): number[][][] {
    return [
        [
            [west, south],
            [east, south],
            [east, north],
            [west, north],
            [west, south],
        ],
    ];
}

function ringIrregular(pts: [number, number][]): number[][][] {
    const closed = [...pts, pts[0]];
    return [closed];
}

export function buildOrbitalThreatPolygons(input: {
    overlaySolarFlare: boolean;
    overlaySolarStorm: boolean;
    overlayDebris: boolean;
    overlayGeomagnetic: boolean;
    overlayRadiationActive: boolean;
    threatLevel: UiThreatLevel;
    activeThreats: ActiveThreat[];
}): ThreatPolygon[] {
    const out: ThreatPolygon[] = [];
    const solarOn =
        input.overlaySolarFlare
        || input.overlaySolarStorm
        || input.activeThreats.some(
            (t) =>
                t.kind === 'SOLAR_STORM'
                || t.kind === 'SOLAR_FLARE'
                || t.kind === 'SATELLITE_CHARGING'
        );
    const debrisOn =
        input.overlayDebris
        || input.activeThreats.some(
            (t) => t.kind === 'DEBRIS' || t.kind === 'CONJUNCTION'
        );
    const radOn =
        input.overlayRadiationActive
        || input.activeThreats.some(
            (t) =>
                t.kind === 'RADIATION'
                || t.kind === 'SEP_EVENT'
                || t.kind === 'RADIO_BURST'
        );
    const dragOn =
        input.overlayGeomagnetic
        || input.activeThreats.some(
            (t) => t.kind === 'GEOMAG' || t.kind === 'ORBITAL_DECAY'
        )
        || input.threatLevel === 'WARNING'
        || input.threatLevel === 'HIGH'
        || input.threatLevel === 'CRITICAL';

    if (solarOn) {
        out.push({
            id: 'solar-corridor',
            geometry: {
                type: 'Polygon',
                coordinates: ringRect(-35, 155, -48, 52),
            },
            capColor: SOLAR,
            alt: 0.016,
        });
    }

    if (debrisOn) {
        out.push({
            id: 'debris-field',
            geometry: {
                type: 'Polygon',
                coordinates: ringIrregular([
                    [-118, 22],
                    [-72, 18],
                    [-58, 38],
                    [-88, 52],
                    [-132, 44],
                    [-142, 30],
                ]),
            },
            capColor: DEBRIS,
            alt: 0.018,
        });
    }

    if (dragOn) {
        out.push({
            id: 'drag-zone',
            geometry: {
                type: 'Polygon',
                coordinates: ringRect(-180, 180, -24, 24),
            },
            capColor: DRAG,
            alt: 0.012,
        });
    }

    if (radOn) {
        out.push({
            id: 'belt-n',
            geometry: {
                type: 'Polygon',
                coordinates: ringRect(-180, 180, 26, 44),
            },
            capColor: BELT,
            alt: 0.014,
        });
        out.push({
            id: 'belt-s',
            geometry: {
                type: 'Polygon',
                coordinates: ringRect(-180, 180, -44, -26),
            },
            capColor: BELT,
            alt: 0.014,
        });
    }

    return out;
}

function sevLabel(level: UiThreatLevel): string {
    if (level === 'CRITICAL') return 'CRITICAL';
    if (level === 'HIGH') return 'HIGH';
    if (level === 'WARNING') return 'ELEVATED';
    return 'NOMINAL';
}

export function buildThreatHtmlLabels(input: {
    activeThreats: ActiveThreat[];
    threatLevel: UiThreatLevel;
    overlaySolarFlare: boolean;
    overlaySolarStorm: boolean;
    overlayDebris: boolean;
    overlayRadiationActive: boolean;
}): ThreatHtmlLabel[] {
    const labels: ThreatHtmlLabel[] = [];
    const sev = sevLabel(input.threatLevel);

    for (const t of input.activeThreats) {
        let lat = 28;
        let lng = -40;
        let color = SOLAR;
        let title = t.label.replace(/^⚠\s*/, '').toUpperCase();
        let subtitle = (t.sublabel ?? `SEVERITY: ${sev}`).toUpperCase();

        switch (t.kind) {
            case 'DEBRIS':
            case 'CONJUNCTION':
                lat = 40;
                lng = -95;
                color = DEBRIS;
                if (!t.sublabel && t.kind === 'DEBRIS') {
                    title = 'DEBRIS CROSSING VECTOR';
                    subtitle = `SEVERITY: ${sev}`;
                }
                break;
            case 'SOLAR_STORM':
            case 'SOLAR_FLARE':
            case 'SATELLITE_CHARGING':
                lat = 18;
                lng = 55;
                color = SOLAR;
                if (!t.sublabel && (t.kind === 'SOLAR_STORM' || t.kind === 'SOLAR_FLARE')) {
                    title = 'CME RADIATION CORRIDOR';
                    subtitle = `SEVERITY: ${sev}`;
                }
                break;
            case 'RADIATION':
            case 'SEP_EVENT':
            case 'RADIO_BURST':
                lat = -32;
                lng = 120;
                color = BELT;
                if (!t.sublabel && t.kind === 'RADIATION') {
                    title = 'VAN ALLEN BELT EXPANSION';
                    subtitle = `SEVERITY: ${sev}`;
                }
                break;
            case 'GEOMAG':
            case 'ORBITAL_DECAY':
                lat = 5;
                lng = -150;
                color = DRAG;
                if (!t.sublabel && t.kind === 'GEOMAG') {
                    title = 'ELEVATED DRAG ZONE';
                    subtitle = `SEVERITY: ${sev}`;
                }
                break;
            default:
                break;
        }

        labels.push({
            id: `lbl-${t.id}`,
            lat,
            lng,
            altitude: 0.07,
            title,
            subtitle,
            color,
        });
    }

    if (labels.length === 0) {
        if (input.overlaySolarStorm || input.overlaySolarFlare) {
            labels.push({
                id: 'lbl-solar-auto',
                lat: 22,
                lng: 48,
                altitude: 0.07,
                title: 'CME RADIATION CORRIDOR',
                subtitle: `SEVERITY: ${sev}`,
                color: SOLAR,
            });
        }
        if (input.overlayDebris) {
            labels.push({
                id: 'lbl-debris-auto',
                lat: 38,
                lng: -88,
                altitude: 0.07,
                title: 'DEBRIS FIELD',
                subtitle: `SEVERITY: ${sev}`,
                color: DEBRIS,
            });
        }
        if (input.overlayRadiationActive) {
            labels.push({
                id: 'lbl-belt-auto',
                lat: -28,
                lng: 105,
                altitude: 0.07,
                title: 'RADIATION BELT EXPANSION',
                subtitle: `SEVERITY: ${sev}`,
                color: BELT,
            });
        }
    }

    return labels;
}

export function labelHtmlBlock(l: ThreatHtmlLabel): string {
    const sq = l.color.includes('176, 48')
        ? '#B03030'
        : l.color.includes('200, 122')
          ? '#C87A1A'
          : l.color.includes('139, 105')
            ? '#8B6914'
            : '#A05020';
    return `
<div style="display:flex;align-items:flex-start;gap:8px;font-family:ui-monospace,monospace;user-select:none;pointer-events:none;">
  <div style="width:10px;height:10px;background:${sq};flex-shrink:0;margin-top:2px;box-shadow:0 0 6px ${sq}88;"></div>
  <div style="display:flex;flex-direction:column;align-items:flex-start;border-left:1px solid rgba(255,255,255,0.22);padding-left:10px;min-width:0;">
    <div style="font-size:11px;font-weight:700;color:#f2f2f2;line-height:1.2;white-space:nowrap;">${l.title}</div>
    <div style="font-size:9px;color:#9aa3ad;margin-top:2px;white-space:nowrap;">${l.subtitle}</div>
  </div>
</div>`.trim();
}
