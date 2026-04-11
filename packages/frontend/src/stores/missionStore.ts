import { useMemo } from 'react';
import { create } from 'zustand';
import {
    deriveRegistryFromCatalogTotal,
    type OrbitalRegistryCounts,
} from '../utils/orbitalRegistry';
import type { OrbitalInterceptMarkerState } from '../globe/cinematicInterceptHtml';
import { SIM_CINEMATIC_EVENTS, type SimCinematicEvent } from '../mocks/simCinematicEvents';
import { buildCatalogSatellitePositions } from '../data/satelliteRegistry';
import {
    SPACE_WEATHER_CATALOG,
    baseAltitudeKmForWeatherCategory,
} from '../data/spaceWeatherCatalog';
import type { OrbitPathPoint } from '../globe/orbitPathUtils';
import type { OrbitSuggestionPayload } from '../types/orbitSuggestion';
import { EARTH_RADIUS_KM } from '../utils/constants';
import type {
    RiskLevel,
    RiskState,
    SpaceWeatherState,
    MissionBrief,
    SatPosition,
    AlertRecord,
    ConjunctionEvent,
    FlarePathPrediction,
} from '@sentinel/shared/src/types';

export type UiThreatLevel = 'NOMINAL' | 'WARNING' | 'HIGH' | 'CRITICAL';

/** Particle ring HUD: ALERT overrides SPEAKING. */
export type AgentRingStatus = 'IDLE' | 'SPEAKING' | 'ALERT';

export function computeAgentRingStatus(
    threatLevel: UiThreatLevel,
    agentSpeaking: boolean
): AgentRingStatus {
    if (threatLevel === 'HIGH' || threatLevel === 'CRITICAL') return 'ALERT';
    if (agentSpeaking) return 'SPEAKING';
    return 'IDLE';
}

/** Three.js threat library slot (matches child `name` on threat asset groups). */
export type CinematicThreatVisual =
    | 'NONE'
    | 'SOLAR_STORM'
    | 'SOLAR_FLARE_XCLASS'
    | 'SOLAR_FLARE_MCLASS'
    | 'CME_STANDARD'
    | 'CME_HALO'
    | 'CME_CORONAGRAPH'
    | 'CME_COMPOSITE'
    | 'SOLAR_ENERGETIC_PARTICLE'
    | 'PROTON_FLUX'
    | 'GEOMAGNETIC_STORM_G3'
    | 'GEOMAGNETIC_STORM_G4'
    | 'GEOMAGNETIC_STORM_G5'
    | 'MAGNETOSPHERE_COMPRESSION'
    | 'ATMOSPHERIC_DRAG'
    | 'RADIATION_BELT'
    | 'CONJUNCTION'
    | 'EXTREME_CME';

export interface CinematicHtmlAnchor {
    id: string;
    lat: number;
    lng: number;
    altitude: number;
    html: string;
}

export interface CinematicArcPulse {
    id: string;
    startLat: number;
    startLng: number;
    endLat: number;
    endLng: number;
    startAltitude: number;
    endAltitude: number;
}

/** Asset risk panel tracked in screen space from the satellite mesh (not globe HTML layer). */
export interface CinematicAssetRiskOverlay {
    satelliteName: string;
    html: string;
}

/** Which cinematic HTML card is visible during simulate — never both satellite and threat. */
export type CinematicActiveCard = null | 'satellite' | 'threat';

export type GlobeViewMode = 'TACTICAL' | 'OPTICAL' | 'THERMAL' | 'CLASSIFIED';
export type ZoomState = 'OVERVIEW' | 'ZONE_LOCK' | 'ASSET_LOCK';
export type CallStatus = 'IDLE' | 'CALLING' | 'CONNECTED' | 'ENDED';
export type CommsSeverity = 'nominal' | 'warning' | 'critical';

export interface CommsLogEntry {
    id: string;
    time: string;
    event: string;
    status: string;
    severity: CommsSeverity;
}

export interface PhoneCallLine {
    id: string;
    text: string;
}

export type ThreatKind =
    | 'SOLAR_STORM'
    | 'DEBRIS'
    | 'GEOMAG'
    | 'RADIATION'
    | 'SOLAR_FLARE'
    | 'SEP_EVENT'
    | 'CONJUNCTION'
    | 'SATELLITE_CHARGING'
    | 'RADIO_BURST'
    | 'ORBITAL_DECAY';

export interface ActiveThreat {
    id: string;
    kind: ThreatKind;
    label: string;
    sublabel?: string;
    lat?: number;
    lng?: number;
}

export interface SelectedAsset {
    id: string;
    name: string;
    orbit: string;
    altitudeKm: number;
    status: string;
    threat: string;
    action: string;
    /** Subsatellite point — used for tactical zoom / link arcs. */
    lat?: number;
    lng?: number;
}

export interface LiveStats {
    /** Full-catalog breakdown (LEO … debris); totals drive the HUD registry. */
    orbitalRegistry: OrbitalRegistryCounts;
    atRiskAssets: number;
    nextEventWindow: string;
    agentConfidencePct: number;
}

export interface GlobeHud {
    altitudeKm: number;
    zoomMul: number;
}

/** Cross-links between dummy surface weather markers and catalog satellites (angular proximity). */
export interface GlobeLinkHighlights {
    satellitesAffected: string[];
    satellitesPotential: string[];
    weatherAffected: string[];
    weatherPotential: string[];
}

const EMPTY_GLOBE_LINKS: GlobeLinkHighlights = {
    satellitesAffected: [],
    satellitesPotential: [],
    weatherAffected: [],
    weatherPotential: [],
};

interface ConnectionState {
    connected: boolean;
    lastUpdate: string | null;
}

function mapRiskLevelToUi(level: RiskLevel): UiThreatLevel {
    switch (level) {
        case 'LOW':
            return 'NOMINAL';
        case 'MODERATE':
            return 'WARNING';
        case 'HIGH':
            return 'HIGH';
        case 'CRITICAL':
            return 'CRITICAL';
        default:
            return 'NOMINAL';
    }
}

interface MissionStore {
    risk: RiskState | null;
    weather: SpaceWeatherState | null;
    brief: MissionBrief | null;
    satellites: SatPosition[];
    satelliteCount: number;
    alerts: AlertRecord[];
    conjunctions: ConjunctionEvent[];
    flarePathPredictions: FlarePathPrediction[];
    connection: ConnectionState;

    threatLevel: UiThreatLevel;
    threatBarPct: number;
    activeThreats: ActiveThreat[];
    commsLog: CommsLogEntry[];
    missionBrief: string;
    missionBriefTyping: string;
    zoomState: ZoomState;
    selectedAsset: SelectedAsset | null;
    agentSpeaking: boolean;
    /** Drives Three.js agent ring: synced from threat + speaking. */
    agentStatus: AgentRingStatus;
    agentRingTone: 'nominal' | 'warning' | 'critical';
    callStatus: CallStatus;
    phoneLog: PhoneCallLine[];
    liveStats: LiveStats;
    globeHud: GlobeHud;
    /** When true, globe auto-rotation stays off until cleared (object focus). */
    globeDriftFrozen: boolean;
    globeLinkHighlights: GlobeLinkHighlights;
    /** Dummy weather marker id when a danger icon is focused. */
    focusedWeatherEventId: string | null;
    tacticalLinkArcs: CinematicArcPulse[];
    assetSituationSummary: string | null;

    overlaySolarFlare: boolean;
    overlaySolarStorm: boolean;
    overlayDebris: boolean;
    overlayGeomagnetic: boolean;
    overlayRadiationActive: boolean;
    cmeSatellitesRed: boolean;
    /** Brief white flash on satellites in CME path when the wave crosses the corridor */
    cmeSatellitesWhiteFlash: boolean;
    /** Full line being spoken (browser TTS); drives HUD transcript. */
    agentSpeechTarget: string;
    /** Revealed character index for live transcript. */
    agentSpeechRevealEnd: number;
    /** Previous utterance shown dimmed after speech ends. */
    agentOutputGhost: string | null;
    simulateRunning: boolean;

    /** Cinematic intercept demo: disables auto CME flash hooks and risk overwrites. */
    cinematicActive: boolean;
    orbitalInterceptMarker: OrbitalInterceptMarkerState | null;
    interceptBannerActive: boolean;
    impactDeadlineMs: number | null;
    showImpactCountdown: boolean;
    showCinematicDisengage: boolean;
    missionBriefSlideIn: boolean;
    /** Index into SIM_CINEMATIC_EVENTS for the next Simulate press. */
    simulateQueueIndex: number;
    /** Active demo event (countdown + stats overlay) while cinematic runs. */
    cinematicDemoEvent: SimCinematicEvent | null;
    /** HTML elements anchored to lat/lng/alt (threat intel only; asset risk uses screen follow). */
    cinematicHtmlAnchors: CinematicHtmlAnchor[];
    /** Single card slot: satellite screen card vs threat globe card (mutually exclusive). */
    cinematicActiveCard: CinematicActiveCard;
    /** Danger label content + which catalog `SatPosition.name` to follow in 3D. */
    cinematicAssetRiskOverlay: CinematicAssetRiskOverlay | null;
    /** One-shot threat vector arc (fades with clear). */
    cinematicArcPulse: CinematicArcPulse | null;
    /** Which `THREAT_LIB` child `name` is visible during simulate (see `buildThreatAssetLibrary`). */
    cinematicThreatVisual: CinematicThreatVisual;
    /** Swap white dot for detailed commsat mesh during simulate lock. */
    cinematicDetailSatelliteName: string | null;
    /** Freeze detail rotation while threat vector draws / camera leaves asset. */
    cinematicSatelliteRotationPaused: boolean;
    /** Lat/lng/alt (globe units) for debris / belt anchor. */
    cinematicThreatAnchor: { lat: number; lng: number; alt: number } | null;
    /** Expand atmosphere shell for drag demo. */
    cinematicAtmosphereExpand: boolean;
    /** Satellite `name` field values (e.g. STARLINK-4800) pulsing risk color on the point cloud. */
    cinematicRiskSatelliteNames: string[];

    /** After sim mission brief: show Claude orbit suggestion CTA. */
    orbitSuggestionCtaVisible: boolean;
    orbitSuggestionLoading: boolean;
    orbitSuggestionResult: OrbitSuggestionPayload | null;
    orbitPathOriginal: OrbitPathPoint[] | null;
    orbitPathSuggested: OrbitPathPoint[] | null;

    weatherSearchOpen: boolean;
    weatherSearchQuery: string;
    weatherCategoryPill: string;
    activeWeatherEventIds: string[];
    weatherCatalogDots: Array<{ lat: number; lng: number; alt: number }>;

    globeViewMode: GlobeViewMode;

    alertNumber: string;
    callThresholdLabel: string;

    setRisk: (risk: RiskState) => void;
    setWeather: (weather: SpaceWeatherState) => void;
    setBrief: (brief: MissionBrief | null) => void;
    setSatellites: (satellites: SatPosition[]) => void;
    setSatelliteCount: (count: number) => void;
    addAlert: (alert: AlertRecord) => void;
    setAlerts: (alerts: AlertRecord[]) => void;
    setConjunctions: (conjunctions: ConjunctionEvent[]) => void;
    setFlarePathPredictions: (flarePathPredictions: FlarePathPrediction[]) => void;
    setConnected: (connected: boolean) => void;
    setLastUpdate: (timestamp: string) => void;
    initializeFromStatus: (data: {
        risk: RiskState;
        brief: MissionBrief | null;
        spaceWeather: SpaceWeatherState;
        satelliteCount: number;
        lastAgentUpdate: string;
    }) => void;

    setThreatLevel: (level: UiThreatLevel) => void;
    setThreatBarPct: (pct: number) => void;
    setActiveThreats: (threats: ActiveThreat[]) => void;
    addActiveThreat: (threat: ActiveThreat) => void;
    removeActiveThreat: (id: string) => void;
    prependComms: (entry: Omit<CommsLogEntry, 'id'> & { id?: string }) => void;
    setMissionBrief: (text: string) => void;
    setMissionBriefTyping: (text: string) => void;
    appendPhoneLog: (text: string) => void;
    clearPhoneLog: () => void;
    setZoomState: (z: ZoomState) => void;
    setSelectedAsset: (asset: SelectedAsset | null) => void;
    setAgentSpeaking: (v: boolean) => void;
    setAgentRingTone: (t: 'nominal' | 'warning' | 'critical') => void;
    setCallStatus: (s: CallStatus) => void;
    setLiveStats: (partial: Partial<LiveStats>) => void;
    setGlobeHud: (partial: Partial<GlobeHud>) => void;
    setGlobeDriftFrozen: (v: boolean) => void;
    setGlobeLinkHighlights: (h: GlobeLinkHighlights) => void;
    setFocusedWeatherEventId: (id: string | null) => void;
    setTacticalLinkArcs: (arcs: CinematicArcPulse[]) => void;
    setAssetSituationSummary: (text: string | null) => void;
    clearGlobeInteraction: () => void;

    setOverlaySolarFlare: (v: boolean) => void;
    setOverlaySolarStorm: (v: boolean) => void;
    setOverlayDebris: (v: boolean) => void;
    setOverlayGeomagnetic: (v: boolean) => void;
    setOverlayRadiationActive: (v: boolean) => void;
    setCmeSatellitesRed: (v: boolean) => void;
    setCmeSatellitesWhiteFlash: (v: boolean) => void;
    beginAgentSpeech: (text: string) => void;
    setAgentSpeechRevealEnd: (n: number) => void;
    endAgentSpeech: () => void;
    setGlobeViewMode: (m: GlobeViewMode) => void;
    setSimulateRunning: (v: boolean) => void;

    setCinematicActive: (v: boolean) => void;
    setOrbitalInterceptMarker: (m: OrbitalInterceptMarkerState | null) => void;
    patchOrbitalInterceptMarker: (partial: Partial<OrbitalInterceptMarkerState>) => void;
    setInterceptBannerActive: (v: boolean) => void;
    setImpactDeadlineMs: (v: number | null) => void;
    setShowImpactCountdown: (v: boolean) => void;
    setShowCinematicDisengage: (v: boolean) => void;
    setMissionBriefSlideIn: (v: boolean) => void;
    /** Pass a value or an updater `(prev) => next`; index is always normalized to `[0, events.length)`. */
    setSimulateQueueIndex: (nextOrUpdater: number | ((prev: number) => number)) => void;
    advanceSimulateQueue: () => void;
    clearCinematicUi: () => void;
    setCinematicDemoEvent: (ev: SimCinematicEvent | null) => void;
    setCinematicHtmlAnchors: (rows: CinematicHtmlAnchor[]) => void;
    setCinematicActiveCard: (card: CinematicActiveCard) => void;
    setCinematicAssetRiskOverlay: (o: CinematicAssetRiskOverlay | null) => void;
    setCinematicArcPulse: (arc: CinematicArcPulse | null) => void;
    setCinematicThreatVisual: (v: CinematicThreatVisual) => void;
    setCinematicDetailSatelliteName: (name: string | null) => void;
    setCinematicSatelliteRotationPaused: (v: boolean) => void;
    setCinematicThreatAnchor: (a: { lat: number; lng: number; alt: number } | null) => void;
    setCinematicAtmosphereExpand: (v: boolean) => void;
    setCinematicRiskSatelliteNames: (names: string[]) => void;

    setOrbitSuggestionCtaVisible: (v: boolean) => void;
    setOrbitSuggestionLoading: (v: boolean) => void;
    setOrbitSuggestionResult: (r: OrbitSuggestionPayload | null) => void;
    setOrbitPaths: (o: {
        original: OrbitPathPoint[] | null;
        suggested: OrbitPathPoint[] | null;
    }) => void;
    clearOrbitSuggestionSession: () => void;

    setWeatherSearchOpen: (v: boolean) => void;
    setWeatherSearchQuery: (q: string) => void;
    setWeatherCategoryPill: (c: string) => void;
    toggleWeatherCatalogEvent: (id: string) => void;
    clearWeatherCatalogSelection: () => void;

    setAlertNumber: (n: string) => void;
    resetUiToNominal: () => void;
}

const MAX_COMMS = 24;

function id(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildWeatherDotsForIds(ids: string[]): Array<{ lat: number; lng: number; alt: number }> {
    const out: Array<{ lat: number; lng: number; alt: number }> = [];
    for (const eventId of ids) {
        const ev = SPACE_WEATHER_CATALOG.find((e) => e.id === eventId);
        if (!ev) continue;
        for (let i = 0; i < ev.dotCount; i++) {
            const lat = (Math.random() - 0.5) * 160;
            const lng = Math.random() * 360 - 180;
            const base = baseAltitudeKmForWeatherCategory(ev.category);
            const altKm = base * (0.82 + Math.random() * 0.36);
            out.push({
                lat,
                lng,
                alt: altKm / EARTH_RADIUS_KM,
            });
        }
    }
    return out;
}

export const useMissionStore = create<MissionStore>((set, get) => ({
    risk: null,
    weather: null,
    brief: null,
    satellites: buildCatalogSatellitePositions(),
    satelliteCount: 0,
    alerts: [],
    conjunctions: [],
    flarePathPredictions: [],
    connection: { connected: false, lastUpdate: null },

    threatLevel: 'NOMINAL',
    threatBarPct: 12,
    activeThreats: [],
    commsLog: [],
    missionBrief: '',
    missionBriefTyping: '',
    zoomState: 'OVERVIEW',
    selectedAsset: null,
    agentSpeaking: false,
    agentStatus: 'IDLE',
    agentRingTone: 'nominal',
    callStatus: 'IDLE',
    phoneLog: [],
    liveStats: {
        orbitalRegistry: deriveRegistryFromCatalogTotal(31_976),
        atRiskAssets: 0,
        nextEventWindow: 'T-0H',
        agentConfidencePct: 94,
    },
    globeHud: { altitudeKm: 847, zoomMul: 1 },
    globeDriftFrozen: false,
    globeLinkHighlights: EMPTY_GLOBE_LINKS,
    focusedWeatherEventId: null,
    tacticalLinkArcs: [],
    assetSituationSummary: null,

    overlaySolarFlare: false,
    overlaySolarStorm: false,
    overlayDebris: false,
    overlayGeomagnetic: false,
    overlayRadiationActive: false,
    cmeSatellitesRed: false,
    cmeSatellitesWhiteFlash: false,
    agentSpeechTarget: '',
    agentSpeechRevealEnd: 0,
    agentOutputGhost: null,
    simulateRunning: false,

    cinematicActive: false,
    orbitalInterceptMarker: null,
    interceptBannerActive: false,
    impactDeadlineMs: null,
    showImpactCountdown: false,
    showCinematicDisengage: false,
    missionBriefSlideIn: false,
    simulateQueueIndex: 0,
    cinematicDemoEvent: null,
    cinematicHtmlAnchors: [],
    cinematicActiveCard: null,
    cinematicAssetRiskOverlay: null,
    cinematicArcPulse: null,
    cinematicThreatVisual: 'NONE',
    cinematicDetailSatelliteName: null,
    cinematicSatelliteRotationPaused: false,
    cinematicThreatAnchor: null,
    cinematicAtmosphereExpand: false,
    cinematicRiskSatelliteNames: [],

    orbitSuggestionCtaVisible: false,
    orbitSuggestionLoading: false,
    orbitSuggestionResult: null,
    orbitPathOriginal: null,
    orbitPathSuggested: null,

    weatherSearchOpen: false,
    weatherSearchQuery: '',
    weatherCategoryPill: 'ALL',
    activeWeatherEventIds: [],
    weatherCatalogDots: [],

    globeViewMode: 'OPTICAL',

    alertNumber:
        typeof window !== 'undefined'
            ? localStorage.getItem('sentinel_alert_number') || ''
            : '',
    callThresholdLabel: 'HIGH RISK',

    setRisk: (risk) =>
        set((state) => {
            const applyThreat = !state.simulateRunning && !state.cinematicActive;
            const nextThreat = applyThreat ? mapRiskLevelToUi(risk.level) : state.threatLevel;
            const nextBar = applyThreat
                ? Math.min(100, Math.max(0, risk.score))
                : state.threatBarPct;
            return {
                risk,
                ...(applyThreat ? { threatLevel: nextThreat, threatBarPct: nextBar } : {}),
                agentStatus: computeAgentRingStatus(nextThreat, state.agentSpeaking),
                liveStats: {
                    ...state.liveStats,
                    agentConfidencePct:
                        state.brief?.confidence ?? state.liveStats.agentConfidencePct,
                },
            };
        }),
    setWeather: (weather) => set({ weather }),
    setBrief: (brief) => set({ brief }),
    setSatellites: (satellites) => set({ satellites }),
    setSatelliteCount: (count) =>
        set((s) => ({
            satelliteCount: count,
            liveStats: {
                ...s.liveStats,
                orbitalRegistry:
                    count > 0
                        ? deriveRegistryFromCatalogTotal(count)
                        : s.liveStats.orbitalRegistry,
            },
        })),
    addAlert: (alert) =>
        set((state) => ({
            alerts: [alert, ...state.alerts].slice(0, 100),
        })),
    setAlerts: (alerts) => set({ alerts }),
    setConjunctions: (conjunctions) => set({ conjunctions }),
    setFlarePathPredictions: (flarePathPredictions) => set({ flarePathPredictions }),
    setConnected: (connected) =>
        set((state) => ({
            connection: { ...state.connection, connected },
        })),
    setLastUpdate: (timestamp) =>
        set((state) => ({
            connection: { ...state.connection, lastUpdate: timestamp },
        })),
    initializeFromStatus: (data) => {
        const threatLevel = mapRiskLevelToUi(data.risk.level);
        return set({
            risk: data.risk,
            brief: data.brief,
            weather: data.spaceWeather,
            satelliteCount: data.satelliteCount,
            threatLevel,
            threatBarPct: Math.min(100, Math.max(0, data.risk.score)),
            agentStatus: computeAgentRingStatus(threatLevel, false),
            liveStats: {
                orbitalRegistry: deriveRegistryFromCatalogTotal(
                    data.satelliteCount || 31_976
                ),
                atRiskAssets: 0,
                nextEventWindow: 'T-0H',
                agentConfidencePct: data.brief?.confidence ?? 94,
            },
            connection: {
                connected: true,
                lastUpdate: data.lastAgentUpdate,
            },
        });
    },

    setThreatLevel: (threatLevel) =>
        set((s) => ({
            threatLevel,
            agentStatus: computeAgentRingStatus(threatLevel, s.agentSpeaking),
        })),
    setThreatBarPct: (threatBarPct) => set({ threatBarPct }),
    setActiveThreats: (activeThreats) => set({ activeThreats }),
    addActiveThreat: (threat) =>
        set((s) => ({ activeThreats: [...s.activeThreats, threat] })),
    removeActiveThreat: (tid) =>
        set((s) => ({
            activeThreats: s.activeThreats.filter((t) => t.id !== tid),
        })),
    prependComms: (entry) =>
        set((state) => {
            const row: CommsLogEntry = {
                id: entry.id ?? id(),
                time: entry.time,
                event: entry.event,
                status: entry.status,
                severity: entry.severity,
            };
            return { commsLog: [row, ...state.commsLog].slice(0, MAX_COMMS) };
        }),
    setMissionBrief: (missionBrief) => set({ missionBrief }),
    setMissionBriefTyping: (missionBriefTyping) => set({ missionBriefTyping }),
    appendPhoneLog: (text) =>
        set((s) => ({
            phoneLog: [...s.phoneLog, { id: id(), text }],
        })),
    clearPhoneLog: () => set({ phoneLog: [] }),
    setZoomState: (zoomState) => set({ zoomState }),
    setSelectedAsset: (selectedAsset) => set({ selectedAsset }),
    setAgentSpeaking: (agentSpeaking) =>
        set((s) => ({
            agentSpeaking,
            agentStatus: computeAgentRingStatus(s.threatLevel, agentSpeaking),
        })),
    setAgentRingTone: (agentRingTone) => set({ agentRingTone }),
    setCallStatus: (callStatus) => set({ callStatus }),
    setLiveStats: (partial) =>
        set((s) => ({ liveStats: { ...s.liveStats, ...partial } })),
    setGlobeHud: (partial) =>
        set((s) => ({ globeHud: { ...s.globeHud, ...partial } })),
    setGlobeDriftFrozen: (globeDriftFrozen) => set({ globeDriftFrozen }),
    setGlobeLinkHighlights: (globeLinkHighlights) => set({ globeLinkHighlights }),
    setFocusedWeatherEventId: (focusedWeatherEventId) => set({ focusedWeatherEventId }),
    setTacticalLinkArcs: (tacticalLinkArcs) => set({ tacticalLinkArcs }),
    setAssetSituationSummary: (assetSituationSummary) => set({ assetSituationSummary }),
    clearGlobeInteraction: () =>
        set({
            globeDriftFrozen: false,
            globeLinkHighlights: EMPTY_GLOBE_LINKS,
            focusedWeatherEventId: null,
            zoomState: 'OVERVIEW',
            selectedAsset: null,
            tacticalLinkArcs: [],
            assetSituationSummary: null,
            orbitSuggestionLoading: false,
            orbitSuggestionResult: null,
            orbitPathOriginal: null,
            orbitPathSuggested: null,
        }),

    setOverlaySolarFlare: (overlaySolarFlare) => set({ overlaySolarFlare }),
    setOverlaySolarStorm: (overlaySolarStorm) => set({ overlaySolarStorm }),
    setOverlayDebris: (overlayDebris) => set({ overlayDebris }),
    setOverlayGeomagnetic: (overlayGeomagnetic) => set({ overlayGeomagnetic }),
    setOverlayRadiationActive: (overlayRadiationActive) =>
        set({ overlayRadiationActive }),
    setCmeSatellitesRed: (cmeSatellitesRed) => set({ cmeSatellitesRed }),
    setCmeSatellitesWhiteFlash: (cmeSatellitesWhiteFlash) =>
        set({ cmeSatellitesWhiteFlash }),
    beginAgentSpeech: (text) =>
        set({
            agentSpeechTarget: text,
            agentSpeechRevealEnd: 0,
        }),
    setAgentSpeechRevealEnd: (n) =>
        set((s) => {
            const cap = s.agentSpeechTarget.length;
            const next = Math.max(s.agentSpeechRevealEnd, Math.max(0, n));
            return { agentSpeechRevealEnd: cap === 0 ? 0 : Math.min(next, cap) };
        }),
    endAgentSpeech: () =>
        set((s) => {
            const line = s.agentSpeechTarget.trim();
            if (!line) {
                return {
                    agentSpeechTarget: '',
                    agentSpeechRevealEnd: 0,
                };
            }
            return {
                agentOutputGhost: line,
                agentSpeechTarget: '',
                agentSpeechRevealEnd: 0,
            };
        }),
    setGlobeViewMode: (globeViewMode) => set({ globeViewMode }),
    setSimulateRunning: (simulateRunning) => set({ simulateRunning }),

    setCinematicActive: (cinematicActive) => set({ cinematicActive }),
    setOrbitalInterceptMarker: (orbitalInterceptMarker) => set({ orbitalInterceptMarker }),
    patchOrbitalInterceptMarker: (partial) =>
        set((s) =>
            s.orbitalInterceptMarker
                ? {
                      orbitalInterceptMarker: {
                          ...s.orbitalInterceptMarker,
                          ...partial,
                      },
                  }
                : {}
        ),
    setInterceptBannerActive: (interceptBannerActive) => set({ interceptBannerActive }),
    setImpactDeadlineMs: (impactDeadlineMs) => set({ impactDeadlineMs }),
    setShowImpactCountdown: (showImpactCountdown) => set({ showImpactCountdown }),
    setShowCinematicDisengage: (showCinematicDisengage) => set({ showCinematicDisengage }),
    setMissionBriefSlideIn: (missionBriefSlideIn) => set({ missionBriefSlideIn }),
    setSimulateQueueIndex: (nextOrUpdater) =>
        set((s) => {
            const len = SIM_CINEMATIC_EVENTS.length;
            const raw =
                typeof nextOrUpdater === 'function'
                    ? nextOrUpdater(s.simulateQueueIndex)
                    : nextOrUpdater;
            const simulateQueueIndex =
                len > 0 ? (((raw % len) + len) % len) : 0;
            return { simulateQueueIndex };
        }),
    advanceSimulateQueue: () =>
        set((s) => {
            const len = SIM_CINEMATIC_EVENTS.length;
            if (len < 1) return { simulateQueueIndex: 0 };
            return {
                simulateQueueIndex: (s.simulateQueueIndex + 1) % len,
            };
        }),
    clearCinematicUi: () =>
        set({
            cinematicActive: false,
            orbitalInterceptMarker: null,
            interceptBannerActive: false,
            impactDeadlineMs: null,
            showImpactCountdown: false,
            showCinematicDisengage: false,
            missionBriefSlideIn: false,
            cinematicDemoEvent: null,
            cinematicHtmlAnchors: [],
            cinematicActiveCard: null,
            cinematicAssetRiskOverlay: null,
            cinematicArcPulse: null,
            cinematicThreatVisual: 'NONE',
            cinematicDetailSatelliteName: null,
            cinematicSatelliteRotationPaused: false,
            cinematicThreatAnchor: null,
            cinematicAtmosphereExpand: false,
            cinematicRiskSatelliteNames: [],
            orbitSuggestionCtaVisible: false,
            orbitSuggestionLoading: false,
            orbitSuggestionResult: null,
            orbitPathOriginal: null,
            orbitPathSuggested: null,
        }),
    setCinematicDemoEvent: (cinematicDemoEvent) => set({ cinematicDemoEvent }),
    setCinematicHtmlAnchors: (cinematicHtmlAnchors) => set({ cinematicHtmlAnchors }),
    setCinematicActiveCard: (cinematicActiveCard) => set({ cinematicActiveCard }),
    setCinematicAssetRiskOverlay: (cinematicAssetRiskOverlay) =>
        set({ cinematicAssetRiskOverlay }),
    setCinematicArcPulse: (cinematicArcPulse) => set({ cinematicArcPulse }),
    setCinematicThreatVisual: (cinematicThreatVisual) => set({ cinematicThreatVisual }),
    setCinematicDetailSatelliteName: (cinematicDetailSatelliteName) =>
        set({ cinematicDetailSatelliteName }),
    setCinematicSatelliteRotationPaused: (cinematicSatelliteRotationPaused) =>
        set({ cinematicSatelliteRotationPaused }),
    setCinematicThreatAnchor: (cinematicThreatAnchor) => set({ cinematicThreatAnchor }),
    setCinematicAtmosphereExpand: (cinematicAtmosphereExpand) =>
        set({ cinematicAtmosphereExpand }),
    setCinematicRiskSatelliteNames: (cinematicRiskSatelliteNames) =>
        set({ cinematicRiskSatelliteNames }),

    setOrbitSuggestionCtaVisible: (orbitSuggestionCtaVisible) => set({ orbitSuggestionCtaVisible }),
    setOrbitSuggestionLoading: (orbitSuggestionLoading) => set({ orbitSuggestionLoading }),
    setOrbitSuggestionResult: (orbitSuggestionResult) => set({ orbitSuggestionResult }),
    setOrbitPaths: ({ original, suggested }) =>
        set({
            orbitPathOriginal: original,
            orbitPathSuggested: suggested,
        }),
    clearOrbitSuggestionSession: () =>
        set({
            orbitSuggestionCtaVisible: false,
            orbitSuggestionLoading: false,
            orbitSuggestionResult: null,
            orbitPathOriginal: null,
            orbitPathSuggested: null,
        }),

    setWeatherSearchOpen: (weatherSearchOpen) => set({ weatherSearchOpen }),
    setWeatherSearchQuery: (weatherSearchQuery) => set({ weatherSearchQuery }),
    setWeatherCategoryPill: (weatherCategoryPill) => set({ weatherCategoryPill }),
    toggleWeatherCatalogEvent: (eventId) =>
        set((s) => {
            const next = new Set(s.activeWeatherEventIds);
            if (next.has(eventId)) next.delete(eventId);
            else next.add(eventId);
            const activeWeatherEventIds = [...next];
            return {
                activeWeatherEventIds,
                weatherCatalogDots: buildWeatherDotsForIds(activeWeatherEventIds),
            };
        }),
    clearWeatherCatalogSelection: () =>
        set({ activeWeatherEventIds: [], weatherCatalogDots: [] }),

    setAlertNumber: (alertNumber) => {
        if (typeof window !== 'undefined') {
            localStorage.setItem('sentinel_alert_number', alertNumber);
        }
        set({ alertNumber });
    },

    resetUiToNominal: () =>
        set({
            threatLevel: 'NOMINAL',
            threatBarPct: 12,
            activeThreats: [],
            zoomState: 'OVERVIEW',
            selectedAsset: null,
            agentSpeaking: false,
            agentStatus: 'IDLE',
            overlaySolarFlare: false,
            overlaySolarStorm: false,
            overlayDebris: false,
            overlayGeomagnetic: false,
            overlayRadiationActive: false,
            cmeSatellitesRed: false,
            cmeSatellitesWhiteFlash: false,
            agentSpeechTarget: '',
            agentSpeechRevealEnd: 0,
            agentOutputGhost: null,
            missionBriefTyping: '',
            missionBrief: '',
            callStatus: 'IDLE',
            cinematicActive: false,
            orbitalInterceptMarker: null,
            interceptBannerActive: false,
            impactDeadlineMs: null,
            showImpactCountdown: false,
            showCinematicDisengage: false,
            missionBriefSlideIn: false,
            cinematicDemoEvent: null,
            cinematicHtmlAnchors: [],
            cinematicActiveCard: null,
            cinematicAssetRiskOverlay: null,
            cinematicArcPulse: null,
            cinematicThreatVisual: 'NONE',
            cinematicDetailSatelliteName: null,
            cinematicSatelliteRotationPaused: false,
            cinematicThreatAnchor: null,
            cinematicAtmosphereExpand: false,
            cinematicRiskSatelliteNames: [],
            orbitSuggestionCtaVisible: false,
            orbitSuggestionLoading: false,
            orbitSuggestionResult: null,
            orbitPathOriginal: null,
            orbitPathSuggested: null,
            weatherSearchOpen: false,
            weatherSearchQuery: '',
            weatherCategoryPill: 'ALL',
            activeWeatherEventIds: [],
            weatherCatalogDots: [],
            satellites: buildCatalogSatellitePositions(),
            globeDriftFrozen: false,
            globeLinkHighlights: EMPTY_GLOBE_LINKS,
            focusedWeatherEventId: null,
            tacticalLinkArcs: [],
            assetSituationSummary: null,
        }),
}));

export function uiThreatToBarColor(pct: number): 'green' | 'amber' | 'red' {
    if (pct < 40) return 'green';
    if (pct <= 70) return 'amber';
    return 'red';
}

export function useActiveFlarePathPredictions(): FlarePathPrediction[] {
    const predictions = useMissionStore((s) => s.flarePathPredictions);
    return useMemo(
        () =>
            predictions.filter(
                (p) => new Date(p.arrivalWindowEnd) >= new Date(),
            ),
        [predictions],
    );
}

export function useEarthDirectedPredictions(): FlarePathPrediction[] {
    const predictions = useMissionStore((s) => s.flarePathPredictions);
    return useMemo(
        () =>
            predictions.filter(
                (p) =>
                    p.isEarthDirected &&
                    new Date(p.arrivalWindowEnd) >= new Date(),
            ),
        [predictions],
    );
}
