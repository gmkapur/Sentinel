import axios from 'axios';

import type { DONKIFlare, DONKICME } from '@sentinel/shared';
import { logger } from '../logger';
import { upsertFlares, upsertCMEs, updatePollStatus } from '../dataCache';

const log = logger.child({ component: 'DONKI' });

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

async function fetchFlares(): Promise<DONKIFlare[]> {
    const { startDate, endDate } = getDateRange();
    const url = `${DONKI_BASE}/FLR`;
    const response = await axios.get(url, {
        params: { startDate, endDate, api_key: getApiKey() },
        timeout: 15_000,
    });

    if (!Array.isArray(response.data)) return [];

    return response.data.map(
        (f: Record<string, unknown>): DONKIFlare => ({
            flrID: String(f.flrID ?? ''),
            classType: String(f.classType ?? ''),
            beginTime: String(f.beginTime ?? ''),
            peakTime: String(f.peakTime ?? ''),
            endTime: f.endTime ? String(f.endTime) : null,
            sourceLocation: String(f.sourceLocation ?? ''),
        }),
    );
}

async function fetchCMEs(): Promise<DONKICME[]> {
    const { startDate, endDate } = getDateRange();
    const url = `${DONKI_BASE}/CME`;
    const response = await axios.get(url, {
        params: { startDate, endDate, api_key: getApiKey() },
        timeout: 15_000,
    });

    if (!Array.isArray(response.data)) return [];

    return response.data.map(
        (c: Record<string, unknown>): DONKICME => ({
            activityID: String(c.activityID ?? ''),
            startTime: String(c.startTime ?? ''),
            speed: c.cmeAnalyses
                ? extractCMESpeed(c.cmeAnalyses as Record<string, unknown>[])
                : null,
            type: String(c.type ?? 'unknown'),
        }),
    );
}

function extractCMESpeed(analyses: Record<string, unknown>[]): number | null {
    if (!Array.isArray(analyses) || analyses.length === 0) return null;
    const latest = analyses[analyses.length - 1];
    const speed = Number(latest?.speed);
    return isNaN(speed) ? null : speed;
}

export async function pollDONKI(): Promise<void> {
    log.info('Polling flares and CMEs');

    const results = await Promise.allSettled([fetchFlares(), fetchCMEs()]);

    // Flares
    if (results[0].status === 'fulfilled') {
        const flares = results[0].value;
        await upsertFlares(flares);
        await updatePollStatus('donki-flares', true);
        log.info({ type: 'flares', count: flares.length }, 'DONKI data fetched');
    } else {
        const err =
            results[0].reason instanceof Error
                ? results[0].reason.message
                : String(results[0].reason);
        log.error({ type: 'flares', err }, 'DONKI fetch failed');
        await updatePollStatus('donki-flares', false, err);
    }

    // CMEs
    if (results[1].status === 'fulfilled') {
        const cmes = results[1].value;
        await upsertCMEs(cmes);
        await updatePollStatus('donki-cme', true);
        log.info({ type: 'cmes', count: cmes.length }, 'DONKI data fetched');
    } else {
        const err =
            results[1].reason instanceof Error
                ? results[1].reason.message
                : String(results[1].reason);
        log.error({ type: 'cmes', err }, 'DONKI fetch failed');
        await updatePollStatus('donki-cme', false, err);
    }
}
