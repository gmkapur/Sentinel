import { formatDistanceToNow, parseISO } from 'date-fns';
import type { WeatherStatus } from './colors';

export function formatTimestamp(iso: string): string {
    try {
        return formatDistanceToNow(parseISO(iso), { addSuffix: true });
    }
    catch {
        return '---';
    }
}

export function formatScore(score: number): string {
    return Math.round(score).toString().padStart(2, '0');
}

export function formatCoord(value: number, decimals = 2): string {
    return value.toFixed(decimals);
}

export function formatAlt(altKm: number): string {
    return `${Math.round(altKm).toLocaleString()} km`;
}

export function getXrayStatus(xrayClass: string | null): WeatherStatus {
    if (!xrayClass) return 'nominal';
    const letter = xrayClass.charAt(0).toUpperCase();
    if (letter === 'X') return 'critical';
    if (letter === 'M') return 'warning';
    if (letter === 'C') return 'elevated';
    return 'nominal';
}

export function getKpStatus(kp: number | null): WeatherStatus {
    if (kp === null) return 'nominal';
    if (kp >= 7) return 'critical';
    if (kp >= 5) return 'warning';
    if (kp >= 4) return 'elevated';
    return 'nominal';
}

export function getProtonStatus(flux: number | null): WeatherStatus {
    if (flux === null) return 'nominal';
    if (flux >= 100) return 'critical';
    if (flux >= 10) return 'warning';
    if (flux >= 1) return 'elevated';
    return 'nominal';
}

export function getSolarWindStatus(speed: number | null): WeatherStatus {
    if (speed === null) return 'nominal';
    if (speed > 700) return 'critical';
    if (speed > 500) return 'warning';
    if (speed > 400) return 'elevated';
    return 'nominal';
}

export function getBzStatus(bz: number | null): WeatherStatus {
    if (bz === null) return 'nominal';
    if (bz < -10) return 'critical';
    if (bz < -5) return 'warning';
    if (bz < 0) return 'elevated';
    return 'nominal';
}
