import { useMissionStore } from '../stores/missionStore';
import type { SatPosition } from '@sentinel/shared/src/types';

export function useSatellites(): SatPosition[] {
    return useMissionStore((s) => s.satellites);
}
