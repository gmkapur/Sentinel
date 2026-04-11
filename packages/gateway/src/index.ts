import dotenv from 'dotenv';
import path from 'path';

// Load root .env (CWD is packages/gateway when run via `npm run dev`)
dotenv.config({ path: path.resolve(__dirname, '..', '..', '..', '.env') });

import { createServer } from 'http';

import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';

import prisma, { disconnectDb } from './db';
import { hydrateFromDb } from './agentState';
import { createRouter } from './routes';
import { startTleRefreshLoop, propagateAll } from './satellites';

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*' },
});

const PORT = process.env.GATEWAY_PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---------------------------------------------------------------------------
// Broadcast helper (injected into routes)
// ---------------------------------------------------------------------------

function broadcast(event: string, data: unknown): void {
    io.emit(event, data);
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

const router = createRouter(broadcast);
app.use(router);

// ---------------------------------------------------------------------------
// Socket.io connection handling
// ---------------------------------------------------------------------------

io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    const positions = propagateAll();
    socket.emit('satellite-positions', positions);

    socket.on('disconnect', () => {
        console.log(`[Socket] Client disconnected: ${socket.id}`);
    });
});

// ---------------------------------------------------------------------------
// Satellite position broadcast loop (every 10s)
// ---------------------------------------------------------------------------

setInterval(() => {
    const positions = propagateAll();
    io.emit('satellite-positions', positions);
}, 10_000);

// ---------------------------------------------------------------------------
// Startup sequence
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL');

    await hydrateFromDb();

    startTleRefreshLoop();

    httpServer.listen(PORT, () => {
        console.log(`[Gateway] Running on port ${PORT}`);
    });
}

// ---------------------------------------------------------------------------
// Graceful shutdown
// ---------------------------------------------------------------------------

async function shutdown(signal: string): Promise<void> {
    console.log(`[Gateway] ${signal} received — shutting down`);
    io.close();
    httpServer.close();
    await disconnectDb();
    process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

start().catch((err) => {
    console.error('[Gateway] Fatal startup error:', err);
    process.exit(1);
});
