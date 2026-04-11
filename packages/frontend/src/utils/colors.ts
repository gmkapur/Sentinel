import type { RiskLevel } from '@sentinel/shared/src/types';

export const RISK_COLORS: Record<RiskLevel, string> = {
    LOW: '#22c55e',
    MODERATE: '#eab308',
    HIGH: '#f97316',
    CRITICAL: '#ef4444',
};

export const RISK_BG_COLORS: Record<RiskLevel, string> = {
    LOW: 'rgba(34, 197, 94, 0.15)',
    MODERATE: 'rgba(234, 179, 8, 0.15)',
    HIGH: 'rgba(249, 115, 22, 0.15)',
    CRITICAL: 'rgba(239, 68, 68, 0.15)',
};

export const RISK_BORDER_COLORS: Record<RiskLevel, string> = {
    LOW: 'rgba(34, 197, 94, 0.3)',
    MODERATE: 'rgba(234, 179, 8, 0.3)',
    HIGH: 'rgba(249, 115, 22, 0.3)',
    CRITICAL: 'rgba(239, 68, 68, 0.3)',
};

export type WeatherStatus = 'nominal' | 'elevated' | 'warning' | 'critical';

export const STATUS_COLORS: Record<WeatherStatus, string> = {
    nominal: '#22c55e',
    elevated: '#eab308',
    warning: '#f97316',
    critical: '#ef4444',
};

export function getAltitudeColor(altKm: number): string {
    if (altKm < 2000) return '#22d3ee';      // LEO - cyan
    if (altKm < 35786) return '#eab308';      // MEO - yellow
    if (altKm < 36786) return '#f97316';      // GEO - amber
    return '#a855f7';                          // HEO - purple
}

export function getAltitudeBand(altKm: number): string {
    if (altKm < 2000) return 'LEO';
    if (altKm < 35786) return 'MEO';
    if (altKm < 36786) return 'GEO';
    return 'HEO';
}

export function getRiskLevelColor(level?: RiskLevel): string {
    if (!level) return RISK_COLORS.LOW;
    return RISK_COLORS[level] ?? RISK_COLORS.LOW;
}
