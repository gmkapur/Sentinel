# Tech Stack

## Runtime & Language
- **Language**: JavaScript (ES2022+)
- **Runtime**: Node.js 20+
- **Target platforms**: Linux/macOS/Windows (development), any Node.js hosting (deployment)

## Package Management
- **Package manager**: npm
- **Lock file**: `package-lock.json` — always commit this
- **Install command**: `npm install`

## Frameworks & Libraries

### Core (Backend — 7 dependencies)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `express` | latest | HTTP server and REST API routing | Minimal REST endpoints |
| `socket.io` | latest | WebSocket server for real-time risk alerts | Broadcasts `risk-alert` and `risk-update` events |
| `node-cron` | latest | Cron-based scheduling for data pollers | Replaces BullMQ/Redis for MVP simplicity |
| `axios` | latest | HTTP client for external API requests | Used by all pollers |
| `node-cache` | latest | In-memory TTL cache | Replaces Redis for MVP — TTLs match poll intervals |
| `cors` | latest | CORS middleware for Express | Required since frontend runs on separate Vite dev server |
| `dotenv` | latest | Environment variable loading | Loads `.env` file for API keys |

### Core (Frontend)
| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| `react` | 18.x | UI framework | Standard React SPA |
| `react-dom` | 18.x | React DOM renderer | |
| `react-globe.gl` | latest | 3D globe visualization | Official satellite example available in repo |
| `satellite.js` | 7.x | SGP4/SDP4 orbital propagation | ESM-only, ~30–35 kB gzipped, use `json2satrec()` for OMM |
| `socket.io-client` | latest | WebSocket client | Receives real-time risk updates from backend |
| `three` | latest | 3D rendering (peer dep of globe.gl) | Required by react-globe.gl |

### Development
| Library | Version | Purpose |
|---------|---------|---------|
| `vite` | latest | Frontend build tool and dev server |
| `eslint` | latest | Linting |
| `prettier` | latest | Code formatting |

## Infrastructure
- **Database**: None (in-memory node-cache for MVP)
- **Cache**: node-cache (in-memory with TTL)
- **Message queue**: None (node-cron handles scheduling)
- **Search**: None
- **File storage**: None

## DevOps & Tooling
- **CI/CD**: Not configured for MVP
- **Containerization**: None for MVP (skip Docker)
- **Orchestration**: None
- **Monitoring**: Console logging
- **Error tracking**: None for MVP

## Version Constraints
- Node.js >= 20 required for native fetch support and stable ESM
- satellite.js v7 is ESM-only — ensure `"type": "module"` in package.json or use `.mjs` extensions
- react-globe.gl requires `three` as a peer dependency — install it explicitly
- Do NOT use TLE text format for new code — use JSON/OMM with `json2satrec()`

## Environment Variables

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NASA_API_KEY` | Yes | NASA API key for DONKI and NeoWs (free at api.nasa.gov) | `your-nasa-api-key` |
| `N2YO_API_KEY` | No | N2YO API key for pre-computed positions (free at n2yo.com) | `your-n2yo-key` |
| `SPACE_TRACK_USER` | No | Space-Track.org email (free registration) | `user@example.com` |
| `SPACE_TRACK_PASS` | No | Space-Track.org password | `password` |
| `PORT` | No | Express server port (default: 3001) | `3001` |
| `VITE_API_URL` | No | Backend API URL for frontend (default: `http://localhost:3001`) | `http://localhost:3001` |
