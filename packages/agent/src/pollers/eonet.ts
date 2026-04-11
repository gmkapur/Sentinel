import axios from 'axios';

import { logger } from '../logger';
import { upsertEonetEvents, updatePollStatus } from '../dataCache';

const log = logger.child({ component: 'EONET' });

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';

interface EonetApiEvent {
    id: string;
    title: string;
    categories: Array<{ id: string; title: string }>;
    sources: Array<{ id: string; url: string }>;
    geometry: Array<{ date: string; type: string; coordinates: number[] }>;
    link: string;
}

export async function pollEONET(): Promise<void> {
    log.info('Polling open EONET events');

    try {
        const response = await axios.get(EONET_URL, {
            params: { status: 'open', limit: 10 },
            timeout: 15_000,
        });

        const events: EonetApiEvent[] = response.data?.events ?? [];

        const normalized = events.map((e) => {
            const latestGeometry = e.geometry?.[e.geometry.length - 1];
            return {
                eventId: String(e.id),
                title: String(e.title),
                category: e.categories?.[0]?.title ?? 'Unknown',
                source: e.sources?.[0]?.id ?? 'unknown',
                link: e.link ?? null,
                date: latestGeometry?.date ?? new Date().toISOString(),
                coordinates: latestGeometry?.coordinates
                    ? {
                          type: latestGeometry.type,
                          coordinates: latestGeometry.coordinates,
                      }
                    : null,
            };
        });

        await upsertEonetEvents(normalized);
        await updatePollStatus('eonet', true);
        log.info({ count: normalized.length }, 'EONET events fetched');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        log.error({ err: msg }, 'EONET poll failed');
        await updatePollStatus('eonet', false, msg);
    }
}
