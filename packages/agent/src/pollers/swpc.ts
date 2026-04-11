import axios from 'axios';
import { z } from 'zod';

import { logger } from '../logger';
import { upsertSpaceWeather, updatePollStatus } from '../dataCache';

const log = logger.child({ component: 'SWPC' });

const SWPC_BASE = 'https://services.swpc.noaa.gov';

const ENDPOINTS = {
    'swpc-xray': `${SWPC_BASE}/json/goes/primary/xrays-1-day.json`,
    'swpc-kp': `${SWPC_BASE}/products/noaa-planetary-k-index.json`,
    'swpc-protons': `${SWPC_BASE}/json/goes/primary/integral-protons-1-day.json`,
    'swpc-wind': `${SWPC_BASE}/products/solar-wind/plasma-1-day.json`,
    'swpc-mag': `${SWPC_BASE}/products/solar-wind/mag-1-day.json`,
} as const;

type SwpcSource = keyof typeof ENDPOINTS;

// ---------------------------------------------------------------------------
// Zod schemas for SWPC API response validation
// ---------------------------------------------------------------------------

// SWPC JSON endpoints return arrays of objects or arrays of arrays
const swpcArraySchema = z.array(z.unknown()).min(1, 'Empty SWPC response');

async function fetchAndStore(source: SwpcSource): Promise<void> {
    const url = ENDPOINTS[source];
    const response = await axios.get(url, { timeout: 10_000 });

    // Validate response is a non-empty array (all SWPC endpoints return arrays)
    const validated = swpcArraySchema.safeParse(response.data);
    if (!validated.success) {
        throw new Error(`[SWPC] Invalid ${source} response: ${validated.error.issues[0]?.message}`);
    }

    await upsertSpaceWeather(source, validated.data);
    await updatePollStatus(source, true);
}

export async function pollSWPC(): Promise<void> {
    const sources = Object.keys(ENDPOINTS) as SwpcSource[];
    log.info({ endpointCount: sources.length }, 'Polling all SWPC endpoints');

    const results = await Promise.allSettled(
        sources.map((s) => fetchAndStore(s)),
    );

    for (let i = 0; i < sources.length; i++) {
        const result = results[i];
        const source = sources[i];
        if (result.status === 'fulfilled') {
            log.info({ source }, 'SWPC endpoint polled successfully');
        } else {
            const errorMsg =
                result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason);
            log.error({ source, err: errorMsg }, 'SWPC endpoint poll failed');
            await updatePollStatus(source, false, errorMsg);
        }
    }
}
