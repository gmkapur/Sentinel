import axios from 'axios';

import { upsertSpaceWeather, updatePollStatus } from '../dataCache';

const SWPC_BASE = 'https://services.swpc.noaa.gov';

const ENDPOINTS = {
    'swpc-xray': `${SWPC_BASE}/json/goes/primary/xrays-1-day.json`,
    'swpc-kp': `${SWPC_BASE}/products/noaa-planetary-k-index.json`,
    'swpc-protons': `${SWPC_BASE}/json/goes/primary/integral-protons-1-day.json`,
    'swpc-wind': `${SWPC_BASE}/products/solar-wind/plasma-1-day.json`,
    'swpc-mag': `${SWPC_BASE}/products/solar-wind/mag-1-day.json`,
} as const;

type SwpcSource = keyof typeof ENDPOINTS;

async function fetchAndStore(source: SwpcSource): Promise<void> {
    const url = ENDPOINTS[source];
    const response = await axios.get(url, { timeout: 10_000 });
    await upsertSpaceWeather(source, response.data);
    await updatePollStatus(source, true);
}

export async function pollSWPC(): Promise<void> {
    console.log('[SWPC] Polling all SWPC endpoints...');

    const sources = Object.keys(ENDPOINTS) as SwpcSource[];
    const results = await Promise.allSettled(
        sources.map((s) => fetchAndStore(s)),
    );

    for (let i = 0; i < sources.length; i++) {
        const result = results[i];
        const source = sources[i];
        if (result.status === 'fulfilled') {
            console.log(`[SWPC] ${source} — OK`);
        } else {
            const errorMsg =
                result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason);
            console.error(`[SWPC] ${source} — FAILED: ${errorMsg}`);
            await updatePollStatus(source, false, errorMsg);
        }
    }
}
