import axios from 'axios';

import type { CMEAnalysis } from '@sentinel/shared';
import { logger } from '../logger';
import { upsertCMEAnalyses, updatePollStatus } from '../dataCache';

const log = logger.child({ component: 'CMEAnalysis' });

const DONKI_BASE = 'https://api.nasa.gov/DONKI';

function getApiKey(): string {
    return process.env.NASA_API_KEY || 'DEMO_KEY';
}

/** DONKI silently truncates queries > 30 days. Always cap at 30. */
function getDateRange(): { startDate: string; endDate: string } {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return {
        startDate: thirtyDaysAgo.toISOString().split('T')[0],
        endDate: now.toISOString().split('T')[0],
    };
}

async function fetchCMEAnalyses(): Promise<CMEAnalysis[]> {
    const { startDate, endDate } = getDateRange();
    const url = `${DONKI_BASE}/CMEAnalysis`;
    const response = await axios.get(url, {
        params: {
            startDate,
            endDate,
            mostAccurateOnly: true,
            speed: 500, // Only operationally relevant CMEs (>= 500 km/s)
            catalog: 'ALL',
            api_key: getApiKey(),
        },
        timeout: 15_000,
    });

    if (!Array.isArray(response.data)) return [];

    return response.data.map(
        (a: Record<string, unknown>): CMEAnalysis => ({
            time21_5: String(a.time21_5 ?? ''),
            latitude: Number(a.latitude) || 0,
            longitude: Number(a.longitude) || 0,
            halfAngle: Number(a.halfAngle) || 0,
            speed: Number(a.speed) || 0,
            type: String(a.type ?? 'unknown'),
            isMostAccurate: Boolean(a.isMostAccurate),
            associatedCMEID: String(a.associatedCMEID ?? ''),
            note: String(a.note ?? ''),
            catalog: String(a.catalog ?? ''),
        }),
    );
}

export async function pollCMEAnalysis(): Promise<void> {
    log.info('Polling CME analyses');

    try {
        const analyses = await fetchCMEAnalyses();
        await upsertCMEAnalyses(analyses);
        await updatePollStatus('donki-cme-analysis', true);
        log.info({ count: analyses.length }, 'CME analysis data fetched');
    } catch (error) {
        const err =
            error instanceof Error ? error.message : String(error);
        log.error({ err }, 'CME analysis fetch failed');
        await updatePollStatus('donki-cme-analysis', false, err);
    }
}
