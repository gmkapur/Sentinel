/**
 * Frontend-only temp data: no gateway, no Socket.io, no `/api/*` on boot.
 * Set `VITE_USE_REAL_API=true` to use the gateway and live sockets again.
 */
export const USE_TEMP_DATA_ONLY = import.meta.env.VITE_USE_REAL_API !== 'true';
