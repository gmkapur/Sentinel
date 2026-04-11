import axios from 'axios';

import type { NEOObject } from '@sentinel/shared';
import { logger } from '../logger';
import { upsertNeos, updatePollStatus } from '../dataCache';

const log = logger.child({ component: 'NeoWs' });

const NEOWS_BASE = 'https://api.nasa.gov/neo/rest/v1/feed';

function getApiKey(): string {
    return process.env.NASA_API_KEY || 'DEMO_KEY';
}

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

export async function pollNeoWs(): Promise<void> {
    log.info('Polling near-Earth objects');

    try {
        const now = new Date();
        const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const response = await axios.get(NEOWS_BASE, {
            params: {
                start_date: formatDate(now),
                end_date: formatDate(weekAhead),
                api_key: getApiKey(),
            },
            timeout: 20_000,
        });

        const neos: NEOObject[] = [];
        const nearEarthObjects = response.data?.near_earth_objects;

        if (nearEarthObjects && typeof nearEarthObjects === 'object') {
            for (const dateKey of Object.keys(nearEarthObjects)) {
                const dayNeos = nearEarthObjects[dateKey];
                if (!Array.isArray(dayNeos)) continue;

                for (const neo of dayNeos) {
                    const closeApproach = neo.close_approach_data?.[0];
                    if (!closeApproach) continue;

                    neos.push({
                        id: String(neo.id ?? ''),
                        name: String(neo.name ?? ''),
                        estimatedDiameter: extractDiameter(neo),
                        isPotentiallyHazardous: Boolean(
                            neo.is_potentially_hazardous_asteroid,
                        ),
                        closeApproachDate: String(
                            closeApproach.close_approach_date_full ?? dateKey,
                        ),
                        missDistanceKm: parseFloat(
                            closeApproach.miss_distance?.kilometers ?? '0',
                        ),
                        relativeVelocityKmS: parseFloat(
                            closeApproach.relative_velocity
                                ?.kilometers_per_second ?? '0',
                        ),
                    });
                }
            }
        }

        await upsertNeos(neos);
        await updatePollStatus('neows', true);
        log.info({ count: neos.length }, 'NEOs fetched');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error({ err: msg }, 'NeoWs poll failed');
        await updatePollStatus('neows', false, msg);
    }
}

function extractDiameter(neo: Record<string, unknown>): number {
    const diamObj = neo.estimated_diameter as
        | Record<string, Record<string, number>>
        | undefined;
    if (!diamObj?.meters) return 0;
    const min = diamObj.meters.estimated_diameter_min ?? 0;
    const max = diamObj.meters.estimated_diameter_max ?? 0;
    return (min + max) / 2;
}
