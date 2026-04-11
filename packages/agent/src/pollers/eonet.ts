import axios from 'axios';
import { z } from 'zod';

import { logger } from '../logger';
import { upsertEonetEvents, updatePollStatus } from '../dataCache';

const log = logger.child({ component: 'EONET' });

const EONET_URL = 'https://eonet.gsfc.nasa.gov/api/v3/events';

// ---------------------------------------------------------------------------
// Zod schema for EONET API response validation
// ---------------------------------------------------------------------------

const eonetEventSchema = z.object({
    id: z.string(),
    title: z.string(),
    categories: z.array(z.object({ id: z.string(), title: z.string() })),
    sources: z.array(z.object({ id: z.string(), url: z.string() })),
    geometry: z.array(z.object({
        date: z.string(),
        type: z.string(),
        coordinates: z.array(z.number()),
    })),
    link: z.string(),
});

const eonetResponseSchema = z.object({
    events: z.array(eonetEventSchema).default([]),
});

type EonetApiEvent = z.infer<typeof eonetEventSchema>;

export async function pollEONET(): Promise<void> {
    log.info('Polling open EONET events');

    try {
        const response = await axios.get(EONET_URL, {
            params: { status: 'open', limit: 10 },
            timeout: 15_000,
        });

        const validated = eonetResponseSchema.safeParse(response.data);
        if (!validated.success) {
            log.warn({ err: validated.error.issues[0]?.message }, 'EONET response failed schema validation');
        }
        const events: EonetApiEvent[] = validated.success
            ? validated.data.events
            : (response.data?.events ?? []);

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
