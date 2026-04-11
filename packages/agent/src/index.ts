import 'dotenv/config';
import express from 'express';

const app = express();
const PORT = process.env.AGENT_PORT || 3002;

app.use(express.json());

app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: process.uptime() });
});

app.listen(PORT, () => {
    console.log(`Agent service running on port ${PORT}`);
});
