import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*' },
});
const PORT = process.env.GATEWAY_PORT || 3001;

app.use(cors());
app.use(express.json());

app.get('/api/status', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);
});

httpServer.listen(PORT, () => {
    console.log(`Gateway service running on port ${PORT}`);
});
