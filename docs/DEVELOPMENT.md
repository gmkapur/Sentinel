# Development Guide

## Prerequisites
- Node.js >= 20
- npm (comes with Node.js)
- A free NASA API key from https://api.nasa.gov (optional — `DEMO_KEY` works with lower rate limits)

## First-Time Setup

```bash
# 1. Clone the repository
git clone <repo-url>
cd sentinel

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env and add your NASA_API_KEY (get one free at api.nasa.gov)

# 4. Start the development server
npm run dev
```

No database setup required — all data is cached in-memory and fetched from live APIs.

## Common Development Commands

```bash
# Start dev server (backend + frontend with hot reload)
npm run dev

# Start backend only
npm run dev:server

# Start frontend only (Vite)
npm run dev:client

# Run all tests
npm test

# Lint check (no auto-fix)
npm run lint

# Lint with auto-fix
npm run lint:fix

# Format code
npm run format

# Build for production
npm run build
```

## Project Structure

```
sentinel/
├── server/
│   ├── index.js              # Express + Socket.io entrypoint
│   ├── risk-engine.js        # Multi-source data fusion, 0-100 scoring
│   ├── pollers/
│   │   ├── swpc.js           # NOAA SWPC (X-ray, Kp, protons, solar wind)
│   │   ├── donki.js          # NASA DONKI (flares, CMEs, storms)
│   │   ├── celestrak.js      # CelesTrak orbital elements (OMM/JSON)
│   │   └── neows.js          # NASA NeoWs near-Earth objects
│   └── routes/
│       ├── status.js         # GET /api/status
│       ├── space-weather.js  # GET /api/space-weather
│       ├── alerts.js         # GET /api/alerts
│       └── satellite.js      # GET /api/satellite/:id
├── src/
│   ├── App.jsx               # React app root
│   ├── main.jsx              # Vite entrypoint
│   └── components/
│       ├── Globe.jsx          # react-globe.gl 3D satellite visualization
│       ├── AlertPanel.jsx     # Real-time risk alerts (Socket.io)
│       └── RiskDashboard.jsx  # Score display, level indicator
├── docs/                      # Project documentation (you are here)
├── CLAUDE.md                  # AI agent context file
├── .env.example               # Environment variable template
├── package.json
└── vite.config.js
```

## Workflow

### Branch Strategy
- **Main branch**: `main` — always deployable
- **Feature branches**: `feature/short-description`
- **Bug fix branches**: `fix/short-description`
- **PR required**: Recommended
- **Review required**: Not enforced for MVP

### Before Submitting a PR
```bash
npm run lint && npm test
```

### Commit Message Format
Conventional Commits — `type(scope): description`

Examples:
```
feat(pollers): add SWPC X-ray flux poller
feat(globe): render satellite positions from CelesTrak OMM data
fix(risk-engine): correct compound scoring for sunlit LEO satellites
docs(api): document DONKI endpoint rate limits
```

## Debugging

### Common Issues

#### CORS errors in browser console
CelesTrak and some other APIs block browser requests. All external API calls must go through the Express backend pollers. If you see CORS errors, you're likely calling an external API directly from the frontend.

#### NASA API returning 403 or rate limit errors
The `DEMO_KEY` only allows 30 requests/hour. Register a free key at api.nasa.gov for 1,000 requests/hour. Set it in `.env` as `NASA_API_KEY`.

#### satellite.js import errors
satellite.js v7 is ESM-only. Ensure your package.json has `"type": "module"` or use `.mjs` file extensions.

#### Globe not rendering / black screen
Ensure `three` is installed as a peer dependency of react-globe.gl: `npm install three`.

### Debug Tools
- Backend: Use `DEBUG=sentinel:* npm run dev:server` for verbose logging
- Frontend: React DevTools + browser Network tab to inspect Socket.io frames
- API testing: Use `curl` or Postman to hit `http://localhost:3001/api/status`

## IDE Setup
- **Recommended IDE**: VSCode
- **Recommended extensions**: ESLint, Prettier, ES7+ React snippets
- **Settings**: Format on save enabled
