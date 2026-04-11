import { motion } from 'framer-motion';
import type { SatPosition } from '@sentinel/shared/src/types';
import { getAltitudeBand, getAltitudeColor } from '../../utils/colors';
import { formatCoord, formatAlt } from '../../utils/formatters';

interface SatelliteTooltipProps {
    satellite: SatPosition;
}

export function SatelliteTooltip({ satellite }: SatelliteTooltipProps) {
    const band = getAltitudeBand(satellite.alt);
    const color = getAltitudeColor(satellite.alt);

    return (
        <motion.div
            className="glass-panel p-3 pointer-events-none min-w-[200px]"
            initial={ { opacity: 0, y: 4 } }
            animate={ { opacity: 1, y: 0 } }
            transition={ { duration: 0.15 } }
        >
            <div className="flex items-center gap-2 mb-1">
                <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={ { backgroundColor: color } }
                />
                <span className="font-mono text-sm font-medium text-accent truncate">
                    { satellite.name }
                </span>
            </div>
            <div className="font-mono text-[10px] text-text-muted mb-1.5">
                NORAD { satellite.id } &middot; { band }
            </div>
            <div className="font-mono text-xs text-text-secondary space-y-0.5">
                <div>
                    Lat: { formatCoord(satellite.lat) }&deg; &middot; Lng: { formatCoord(satellite.lng) }&deg;
                </div>
                <div>
                    Alt: { formatAlt(satellite.alt) }
                </div>
            </div>
        </motion.div>
    );
}
