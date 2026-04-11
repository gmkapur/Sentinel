# Deployment & CI/CD

## Environments

| Environment | URL | Branch | Auto-deploy? | Purpose |
|-------------|-----|--------|-------------- |---------|
| Development | `localhost:5173` (frontend), `localhost:3001` (backend) | — | — | Local dev |
| Production | TBD | `main` | No | Live deployment (post-MVP) |

## 6-Hour Sprint Plan

The MVP follows a structured 6-hour build sprint:

### Hour 1–2: Foundation
- Install `react-globe.gl`, `satellite.js`, scaffold Express + Socket.io
- Copy the official Globe.gl satellite example
- Fetch ISS TLE from CelesTrak, render it on the globe
- Server-side: implement SWPC X-ray flux poller (simplest — just `axios.get` a JSON URL, no auth)

### Hour 2–3: Risk Engine
- Add SWPC Kp index and proton flux pollers
- Implement the risk scoring engine with data fusion
- Wire Socket.io to broadcast risk-level changes
- Connect frontend to receive WebSocket alerts

### Hour 3–4: Events & History
- Add DONKI solar flare event polling (use registered NASA API key)
- Build alert history panel
- Add more satellites from CelesTrak `GROUP=ACTIVE` or `GROUP=STATIONS`

### Hour 4–5: Visualization
- Add space weather alert overlay on the globe (HTML marker layer or React side panel)
- Style satellite dots by orbit type
- Add click-to-inspect satellite tooltips

### Hour 5–6: Polish
- Error handling, graceful degradation when APIs are down (serve stale cache)
- Dark globe texture, responsive layout
- UI polish
- Deploy

### What to Skip for MVP
- BullMQ/Redis (use node-cron)
- Space-Track registration (use CelesTrak)
- ESA DISCOS (restricted access)
- Database persistence (in-memory is fine)
- Real conjunction assessment (use SOCRATES reports)
- Docker
- Tests

## CI Pipeline

### Pipeline Steps (Post-MVP)
```
1. Install dependencies (npm ci, cached)
2. Lint check (npm run lint)
3. Unit tests (npm test)
4. Build (npm run build)
5. (on main) Deploy
```

### CI Configuration
- **Platform**: GitHub Actions (planned)
- **Config location**: `.github/workflows/ci.yml`
- **Required checks for merge**: Lint, tests, build

## Deployment Process

### Development
```bash
# Start the full dev stack
npm run dev
# Backend runs on port 3001, frontend on port 5173 (Vite default)
```

### Production Build
```bash
# Build the frontend
npm run build

# Start in production mode
NODE_ENV=production node server/index.js
# Serves built frontend static files + API on a single port
```

### Rollback
Not applicable for MVP (local development only). Post-MVP: redeploy previous git tag.

## Infrastructure

### Hosting
- **Provider**: TBD for production. Options: Railway, Fly.io, Render (all support Node.js + WebSocket)
- **Compute**: Single Node.js process
- **Region**: Closest to user (latency not critical — data is cached)

### Requirements for Hosting Provider
- Must support WebSocket connections (Socket.io)
- Must support persistent processes (not serverless — cron pollers need to run continuously)
- Must allow outbound HTTPS requests to external APIs

### DNS & CDN
- Not configured for MVP
- Post-MVP: Cloudflare for DNS + caching of static assets

## Monitoring & Alerting

### Health Checks
- **Endpoint**: `GET /api/status`
- **What it checks**: Returns current risk score, level, and timestamps of last successful poll for each data source

### Logs
- **Location**: stdout (console.log)
- **Format**: Plaintext for MVP, structured JSON post-MVP
- **What to log**: Poller successes/failures, risk level changes, WebSocket connection counts

## Secrets Management
- **Tool**: `.env` file (local development), platform env vars (production)
- **Never committed**: `.env` files, API keys
- **Required secrets**: `NASA_API_KEY` (free, instant registration)
- **Optional secrets**: `N2YO_API_KEY`, `SPACE_TRACK_USER`, `SPACE_TRACK_PASS`
