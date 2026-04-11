export interface DummyWeatherEvent {
    id: string;
    name: string;
    lat: number;
    lng: number;
    severity: 'EXTREME' | 'CRITICAL' | 'HIGH' | 'MODERATE';
}

export const DUMMY_WEATHER_EVENTS: DummyWeatherEvent[] = [
    { id: 'evt-1', name: 'X2.1 SOLAR FLARE', lat: 28.6, lng: -80.6, severity: 'EXTREME' },
    { id: 'evt-2', name: 'CME EARTH-DIRECTED', lat: 64.2, lng: 21.5, severity: 'HIGH' },
    { id: 'evt-3', name: 'GEOMAGNETIC STORM G3', lat: -33.9, lng: 18.4, severity: 'HIGH' },
    { id: 'evt-4', name: 'RADIATION BELT SURGE', lat: 51.5, lng: -0.1, severity: 'MODERATE' },
    { id: 'evt-5', name: 'SOLAR PROTON EVENT', lat: 35.7, lng: 139.7, severity: 'MODERATE' },
    { id: 'evt-6', name: 'DEBRIS CONJUNCTION WARNING', lat: -22.9, lng: -43.2, severity: 'CRITICAL' },
    { id: 'evt-7', name: 'ATMOSPHERIC DRAG SPIKE', lat: 55.8, lng: 37.6, severity: 'HIGH' },
    { id: 'evt-8', name: 'MAGNETOSPHERE COMPRESSION', lat: 1.3, lng: 103.8, severity: 'MODERATE' },
    { id: 'evt-9', name: 'SOLAR ENERGETIC PARTICLE', lat: -15.4, lng: -47.9, severity: 'HIGH' },
    { id: 'evt-10', name: 'CORONAL HOLE HSS', lat: 40.4, lng: -3.7, severity: 'MODERATE' },
];
