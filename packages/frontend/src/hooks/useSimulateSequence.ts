import { useCallback, useRef, type RefObject } from 'react';
import { format } from 'date-fns';
import { useMissionStore } from '../stores/missionStore';
import { useAgentSpeech } from './useAgentSpeech';
import type { ActiveThreat } from '../stores/missionStore';
import { type GlobeViewHandle } from '../components/globe/GlobeView';
import { EARTH_RADIUS_KM } from '../utils/constants';
import {
    SIM_CINEMATIC_EVENTS,
    buildAgentInterceptLine,
    buildMissionBriefFromSimEvent,
    type SimCinematicEvent,
} from '../mocks/simCinematicEvents';
import type { CinematicThreatVisual } from '../stores/missionStore';
import {
    getCatalogSatelliteById,
    resolveAtRiskSatelliteNames,
    resolveSimTargetSatellite,
} from '../data/satelliteRegistry';
import { buildAssetRiskOverlayHtml, buildThreatIntelOverlayHtml } from '../globe/cinematicOverlayHtml';
import { api } from '../services/api';

const QUEUE_LEN = SIM_CINEMATIC_EVENTS.length;

function pushLine(event: string, status: string, severity: 'nominal' | 'warning' | 'critical') {
    useMissionStore.getState().prependComms({
        time: format(new Date(), 'HH:mm:ss'),
        event,
        status,
        severity,
    });
}

function activeThreatFromSim(ev: SimCinematicEvent): ActiveThreat {
    const base = {
        id: ev.id,
        lat: ev.lat,
        lng: ev.lng,
        label: ev.name.toUpperCase(),
        sublabel: `${ev.severity}  ··  ${ev.id}`,
    };
    switch (ev.type) {
        case 'SOLAR_STORM':
        case 'EXTREME_CME':
            return { ...base, kind: 'SOLAR_STORM' };
        case 'CONJUNCTION':
            return { ...base, kind: 'CONJUNCTION' };
        case 'RADIATION_BELT':
            return { ...base, kind: 'RADIATION' };
        case 'ATMOSPHERIC_DRAG':
            return { ...base, kind: 'ORBITAL_DECAY' };
        default:
            return { ...base, kind: 'SOLAR_STORM' };
    }
}

const SUN_THREAT_VISUALS = new Set<CinematicThreatVisual>([
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

const EARTH_THREAT_VISUALS = new Set<CinematicThreatVisual>([
    'GEOMAGNETIC_STORM_G3',
    'GEOMAGNETIC_STORM_G4',
    'GEOMAGNETIC_STORM_G5',
    'MAGNETOSPHERE_COMPRESSION',
    'ATMOSPHERIC_DRAG',
    'RADIATION_BELT',
]);

function threatVisualFor(ev: SimCinematicEvent): CinematicThreatVisual {
    switch (ev.type) {
        case 'SOLAR_STORM':
            return 'SOLAR_STORM';
        case 'EXTREME_CME':
            return 'EXTREME_CME';
        case 'CONJUNCTION':
            return 'CONJUNCTION';
        case 'RADIATION_BELT':
            return 'RADIATION_BELT';
        case 'ATMOSPHERIC_DRAG':
            return 'ATMOSPHERIC_DRAG';
        default:
            return 'CME_COMPOSITE';
    }
}

function threatPov(ev: SimCinematicEvent): { lat: number; lng: number; altitude: number } {
    const v = threatVisualFor(ev);
    if (SUN_THREAT_VISUALS.has(v)) {
        return { lat: 14, lng: -102, altitude: 0.42 };
    }
    if (EARTH_THREAT_VISUALS.has(v)) {
        return { lat: ev.lat, lng: ev.lng, altitude: 0.44 };
    }
    if (v === 'CONJUNCTION') return { lat: ev.lat, lng: ev.lng, altitude: 0.44 };
    return { lat: ev.lat, lng: ev.lng, altitude: 0.38 };
}

function threatArcFrom(ev: SimCinematicEvent): {
    lat: number;
    lng: number;
    alt: number;
} {
    const v = threatVisualFor(ev);
    if (SUN_THREAT_VISUALS.has(v)) {
        return { lat: 14, lng: -102, alt: 0.48 };
    }
    if (EARTH_THREAT_VISUALS.has(v)) {
        return {
            lat: ev.lat,
            lng: ev.lng,
            alt: ev.orbitAltitudeKm / EARTH_RADIUS_KM + 0.15,
        };
    }
    if (v === 'CONJUNCTION') {
        return {
            lat: ev.lat,
            lng: ev.lng,
            alt: ev.orbitAltitudeKm / EARTH_RADIUS_KM + 0.08,
        };
    }
    return { lat: ev.lat, lng: ev.lng, alt: 0.45 };
}

function applyThreatWorld(ev: SimCinematicEvent): void {
    const st = useMissionStore.getState();
    st.setCinematicActive(true);
    st.setCinematicDemoEvent(ev);
    st.setAgentRingTone('critical');
    const critical = ev.severity === 'CRITICAL' || ev.type === 'EXTREME_CME';
    st.setThreatLevel(critical ? 'CRITICAL' : 'HIGH');
    const bar =
        ev.type === 'EXTREME_CME'
            ? 99
            : ev.severity === 'CRITICAL'
              ? 94
              : 78;
    st.setThreatBarPct(bar);
    st.setLiveStats({
        atRiskAssets: ev.assetsAtRisk,
        nextEventWindow: `CORRIDOR CROSSING T-MINUS ${Math.max(1, Math.round(ev.impactHours))}H`,
        agentConfidencePct: 94,
    });
    st.setActiveThreats([activeThreatFromSim(ev)]);
}

function assetLockSpeech(satName: string): string {
    return `Asset locked. ${satName} in high risk corridor. Threat inbound. Analyzing source.`;
}

function confirmedBrief(ev: SimCinematicEvent): string {
    const speed = ev.type === 'SOLAR_STORM' || ev.type === 'EXTREME_CME' ? '1,400 kilometers per second' : 'elevated';
    return `Threat confirmed. ${ev.name} traveling at ${speed}. Orbital intercept in ${Math.max(1, Math.round(ev.impactHours))} hours. ${ev.assetsAtRisk} satellite assets in the primary corridor. Mission brief is ready. Recommend immediate action.`;
}

export function useSimulateSequence(globeRef: RefObject<GlobeViewHandle | null>) {
    const { speak } = useAgentSpeech();
    const timersRef = useRef<number[]>([]);

    const clearTimers = useCallback(() => {
        timersRef.current.forEach((t) => window.clearTimeout(t));
        timersRef.current = [];
    }, []);

    const disengage = useCallback(() => {
        clearTimers();
        const st = useMissionStore.getState();
        st.setSimulateRunning(false);
        st.clearCinematicUi();
        st.resetUiToNominal();
        st.advanceSimulateQueue();
        st.setLiveStats({ atRiskAssets: 0, nextEventWindow: 'T-0H' });
        st.setAgentRingTone('nominal');
        globeRef.current?.resetPov(2000);
    }, [clearTimers, globeRef]);

    const run = useCallback((targetSatelliteId?: string) => {
        const get = useMissionStore.getState;
        if (get().simulateRunning) return;

        clearTimers();
        get().clearCinematicUi();
        get().setSimulateRunning(true);
        get().setMissionBrief('');
        get().setMissionBriefTyping('');
        get().setMissionBriefSlideIn(false);
        get().setCmeSatellitesRed(false);
        get().setCmeSatellitesWhiteFlash(false);
        get().setZoomState('OVERVIEW');
        get().setSelectedAsset(null);
        get().setCinematicHtmlAnchors([]);
        get().setCinematicActiveCard(null);
        get().setCinematicAssetRiskOverlay(null);
        get().setCinematicArcPulse(null);
        get().setCinematicThreatVisual('NONE');
        get().setCinematicThreatAnchor(null);
        get().setCinematicAtmosphereExpand(false);
        get().setCinematicRiskSatelliteNames([]);
        get().setCinematicDetailSatelliteName(null);
        get().setCinematicSatelliteRotationPaused(false);

        const idx = get().simulateQueueIndex;
        const ev = SIM_CINEMATIC_EVENTS[idx % QUEUE_LEN];
        const g = () => globeRef.current;
        const target =
            (targetSatelliteId && getCatalogSatelliteById(targetSatelliteId))
            || resolveSimTargetSatellite(ev);
        const atRisk = targetSatelliteId
            ? [target.id]
            : resolveAtRiskSatelliteNames(ev);
        const satAlt = target.altitudeKm / EARTH_RADIUS_KM;

        const schedule = (ms: number, fn: () => void) => {
            timersRef.current.push(window.setTimeout(fn, ms));
        };

        /** T+0 */
        schedule(0, () => {
            pushLine(
                'THREAT ACQUIRED  ··  TARGETING AFFECTED ASSETS',
                'INTERCEPT',
                'critical'
            );
            applyThreatWorld(ev);
        });

        /** T+0.8 — fly to satellite mesh in orbit (2s) */
        schedule(800, () => {
            g()?.flyToOrbitalSatellite(
                target.id,
                {
                    lat: target.lat,
                    lng: target.lng,
                    altitudeKm: target.altitudeKm,
                },
                { ms: 2000, altBump: 0.25 }
            );
        });

        /** T+2.8 — asset lock */
        schedule(2800, () => {
            get().setCinematicRiskSatelliteNames(atRisk);
            get().setCinematicDetailSatelliteName(target.id);
            get().setCinematicSatelliteRotationPaused(false);
            get().setCinematicAssetRiskOverlay({
                satelliteName: target.id,
                html: buildAssetRiskOverlayHtml(target, ev),
            });
            get().setCinematicActiveCard('satellite');
            pushLine(
                `ASSET LOCKED  ··  ${target.id}  ··  ${ev.severity}`,
                'LOCK',
                'critical'
            );
            pushLine(
                'THREAT SOURCE IDENTIFIED  ··  INITIATING ZOOM',
                'TRACK',
                'critical'
            );
            void speak(assetLockSpeech(target.id), 'critical');
        });

        /** T+5 — hold on asset: stop rotation, draw threat vector 1.5s (no zoom-out) */
        schedule(5000, () => {
            get().setCinematicSatelliteRotationPaused(true);
            const from = threatArcFrom(ev);
            get().setCinematicArcPulse({
                id: 'threat-vector',
                startLat: from.lat,
                startLng: from.lng,
                endLat: target.lat,
                endLng: target.lng,
                startAltitude: from.alt,
                endAltitude: satAlt,
            });
        });

        /** T+6.5 — clear vector, threat visual + fly to threat */
        schedule(6500, () => {
            get().setCinematicActiveCard(null);
            get().setCinematicArcPulse(null);
            const vis = threatVisualFor(ev);
            get().setCinematicThreatVisual(vis);
            if (vis === 'CONJUNCTION') {
                get().setCinematicThreatAnchor({
                    lat: ev.lat,
                    lng: ev.lng,
                    alt: ev.orbitAltitudeKm / EARTH_RADIUS_KM + 0.02,
                });
            }
            else {
                get().setCinematicThreatAnchor(null);
            }
            if (ev.type === 'ATMOSPHERIC_DRAG') {
                get().setCinematicAtmosphereExpand(true);
            }
            const pov = threatPov(ev);
            g()?.pointOfView(pov, 1500);
        });

        /** T+8 — threat intel card only (satellite card already cleared at T+6.5) */
        schedule(8000, () => {
            const tp = threatPov(ev);
            get().setCinematicHtmlAnchors([
                {
                    id: 'threat-intel',
                    lat: tp.lat,
                    lng: tp.lng,
                    altitude: ev.orbitAltitudeKm / EARTH_RADIUS_KM + 0.06,
                    html: buildThreatIntelOverlayHtml(ev),
                },
            ]);
            get().setCinematicActiveCard('threat');
        });

        /** T+9 — countdown */
        schedule(9000, () => {
            const deadline = Date.now() + ev.impactHours * 3600 * 1000;
            get().setImpactDeadlineMs(deadline);
            get().setShowImpactCountdown(true);
        });

        /** T+10 — agent brief */
        schedule(10000, () => {
            void speak(confirmedBrief(ev), 'critical');
        });

        schedule(10050, () => {
            get().setMissionBrief(buildMissionBriefFromSimEvent(ev));
            get().setMissionBriefSlideIn(true);
            get().setOrbitSuggestionCtaVisible(true);
        });

        /** T+12 — outbound alert */
        schedule(12000, () => {
            pushLine('OUTBOUND ALERT  ··  OPERATOR BEING NOTIFIED', 'COMMS', 'critical');
            const to = get().alertNumber?.trim();
            if (to) {
                void api.postCall({ test: false, to }).catch(() => {
                    pushLine('OUTBOUND ALERT FAILED  ··  CHECK GATEWAY', 'ERROR', 'critical');
                });
            }
        });

        /** T+14 — disengage */
        schedule(14000, () => {
            get().setShowCinematicDisengage(true);
        });
    }, [clearTimers, globeRef, speak]);

    return { run, disengage, clearTimers };
}
