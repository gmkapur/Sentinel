import { motion } from 'framer-motion';
import type { SatPosition } from '@sentinel/shared/src/types';
import {
    getAltitudeBand,
    getAltitudeColor,
    getRiskLevelColor,
} from '../../utils/colors';
import { formatCoord, formatAlt } from '../../utils/formatters';

interface SatelliteTooltipProps {
    satellite: SatPosition;
}

export function SatelliteTooltip({ satellite }: SatelliteTooltipProps) {
    const band = satellite.orbitRegime ?? getAltitudeBand(satellite.alt);
    const color = satellite.riskLevel
        ? getRiskLevelColor(satellite.riskLevel)
        : getAltitudeColor(satellite.alt);

    return (
        <motion.div
            className="glass-panel p-3 pointer-events-none min-w-[220px]"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15 }}
        >
            <div className="flex items-center gap-2 mb-1">
                <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: color }}
                />
                <span className="font-mono text-sm font-medium text-accent truncate">
                    {satellite.name}
                </span>
            </div>
            <div className="font-mono text-[10px] text-text-muted mb-1.5">
                NORAD {satellite.id} &middot; {band}
                {satellite.isSunlit !== undefined && (
                    <> &middot; {satellite.isSunlit ? 'Sunlit' : 'Shadow'}</>
                )}
            </div>

            {satellite.riskScore !== undefined && (
                <div className="flex items-center gap-2 mb-1.5">
                    <span
                        className="font-mono text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{
                            color: getRiskLevelColor(satellite.riskLevel),
                            backgroundColor: `${getRiskLevelColor(satellite.riskLevel)}26`,
                        }}
                    >
                        {satellite.riskLevel}
                    </span>
                    <span className="font-mono text-xs text-text-secondary">
                        {satellite.riskScore}/100
                    </span>
                </div>
            )}

            <div className="font-mono text-xs text-text-secondary space-y-0.5">
                <div>
                    Lat: {formatCoord(satellite.lat)}&deg; &middot; Lng:{' '}
                    {formatCoord(satellite.lng)}&deg;
                </div>
                <div>Alt: {formatAlt(satellite.alt)}</div>
            </div>

            {(satellite.conjunctionCount ?? 0) > 0 && (
                <div className="font-mono text-[10px] text-yellow-400 mt-1">
                    {satellite.conjunctionCount} conjunction{satellite.conjunctionCount !== 1 ? 's' : ''} active
                </div>
            )}

            {satellite.threats && satellite.threats.length > 0 && (
                <div className="mt-1.5 pt-1.5 border-t border-border-subtle">
                    {satellite.threats.slice(0, 2).map((t, i) => (
                        <div
                            key={i}
                            className="font-mono text-[10px] text-risk-high truncate"
                        >
                            {t}
                        </div>
                    ))}
                </div>
            )}
        </motion.div>
    );
}
