# API Reference

## Overview

| Aspect | Detail |
|--------|--------|
| **Gateway base URL** | `http://localhost:3001` (development) |
| **Agent base URL** | `http://localhost:3002` (internal only) |
| **Style** | REST (JSON request/response) |
| **Content type** | `application/json` |
| **Authentication** | None for public endpoints; `x-internal-secret` header for internal push |
| **Versioning** | None (MVP) |

---

## Authentication

### Public API (Gateway)
No authentication required. The gateway serves a read-only dashboard — all endpoints are publicly accessible.

### Internal API (Agent -> Gateway)
The agent pushes data to the gateway using a shared secret:
```bash
curl -X POST http://localhost:3001/internal/agent-push \
  -H "Content-Type: application/json" \
  -H "x-internal-secret: orbit-sentinel-internal-dev-key" \
  -d '{ ... }'
```

### External APIs (Agent -> NASA/NOAA)

| Service | Auth Method |
|---------|------------|
| NASA DONKI/NeoWs | `api_key` query parameter (`NASA_API_KEY` env var) |
| NOAA SWPC | None |
| CelesTrak | None |
| NASA EONET | None |
| Claude API | `x-api-key` header (`ANTHROPIC_API_KEY` env var) |

---

## Gateway Endpoints (`:3001`)

### `GET /api/satellites`

Returns current positions for all tracked satellites, propagated via SGP4 from cached TLEs.

**Response** `200 OK`:
```json
{
  "count": 542,
  "satellites": [
    {
      "id": 25544,
      "name": "ISS (ZARYA)",
      "lat": 42.36,
      "lng": -71.06,
      "alt": 408.2
    }
  ]
}
```

---

### `GET /api/satellites/:noradId`

Returns a single satellite's current position plus its TLE lines.

**Path parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `noradId` | integer | NORAD catalog number |

**Response** `200 OK`:
```json
{
  "id": 25544,
  "name": "ISS (ZARYA)",
  "lat": 42.36,
  "lng": -71.06,
  "alt": 408.2,
  "line1": "1 25544U ...",
  "line2": "2 25544 ..."
}
```

**Response** `404 Not Found`:
```json
{ "error": "Satellite 99999 not found" }
```

---

### `GET /api/status`

Returns the full current system state: risk assessment, mission brief, space weather, and metadata.

**Response** `200 OK`:
```json
{
  "risk": {
    "score": 35,
    "level": "MODERATE",
    "breakdown": {
      "solarFlare": 15,
      "geomagneticStorm": 5,
      "radiationStorm": 5,
      "solarWind": 5,
      "imfBz": 5,
      "neo": 0,
      "compoundBonus": 0
    },
    "previousLevel": "LOW",
    "updatedAt": 1712841600000
  },
  "brief": {
    "recommendation": "CAUTION",
    "summary": "Moderate M-class flare activity detected...",
    "threats": [],
    "maneuver_windows": [],
    "confidence": 0.8,
    "generatedAt": 1712841600000
  },
  "spaceWeather": {
    "xray": { "flux": 1.5e-5, "classType": "M1.5", "timestamp": "2026-04-11T12:00:00Z" },
    "kp": { "value": 4, "timestamp": "2026-04-11T12:00:00Z" },
    "protonFlux": { "flux": 2.5, "timestamp": "2026-04-11T12:00:00Z" },
    "solarWind": { "speed": 450, "density": 5.2, "timestamp": "2026-04-11T12:00:00Z" },
    "bz": { "value": -3.2, "timestamp": "2026-04-11T12:00:00Z" }
  },
  "satelliteCount": 542,
  "lastAgentUpdate": 1712841600000
}
```

---

### `GET /api/alerts`

Returns alert history — records created each time the risk level changes. Maximum 100 records.

**Response** `200 OK`:
```json
[
  {
    "id": "a1b2c3d4-...",
    "riskState": {
      "score": 72,
      "level": "CRITICAL",
      "breakdown": { "...": "..." },
      "previousLevel": "HIGH",
      "updatedAt": 1712841600000
    },
    "brief": { "...": "..." },
    "timestamp": 1712841600000
  }
]
```

---

### `GET /api/space-weather`

Returns the latest processed space weather state from the agent. Returns `null` if no agent data received yet.

**Response** `200 OK`:
```json
{
  "xray": { "flux": 1.5e-5, "classType": "M1.5", "timestamp": "2026-04-11T12:00:00Z" },
  "kp": { "value": 4, "timestamp": "2026-04-11T12:00:00Z" },
  "protonFlux": { "flux": 2.5, "timestamp": "2026-04-11T12:00:00Z" },
  "solarWind": { "speed": 450, "density": 5.2, "timestamp": "2026-04-11T12:00:00Z" },
  "bz": { "value": -3.2, "timestamp": "2026-04-11T12:00:00Z" }
}
```

---

### `GET /api/agent/brief`

Returns the latest LLM-generated mission brief. Checks local cache first, falls back to querying the agent.

**Response** `200 OK`:
```json
{
  "recommendation": "GO",
  "summary": "No significant threats detected. All space weather parameters within nominal ranges.",
  "threats": [],
  "maneuver_windows": [],
  "confidence": 0.9,
  "generatedAt": 1712841600000
}
```

**Response** `404 Not Found`:
```json
{ "error": "No brief available" }
```

---

### `POST /api/agent/brief`

Forces on-demand LLM brief generation. Proxied to agent's `POST /brief/generate`. May take up to 30 seconds.

**Response** `200 OK`: Same structure as `GET /api/agent/brief`.

**Response** `502 Bad Gateway`:
```json
{ "error": "Agent brief generation failed: <message>" }
```

---

### `GET /api/agent/health`

Returns agent service health. Proxied from agent's `/health`.

**Response** `200 OK`:
```json
{
  "status": "ok",
  "uptime": 3600.5,
  "lastPolls": {
    "swpc-xray": 1712841300000,
    "swpc-kp": 1712841300000,
    "donki-flares": 1712840700000,
    "neows": 1712808000000
  },
  "cacheStats": { "hits": 150, "misses": 12, "keys": 10, "ksize": 0, "vsize": 0 }
}
```

**Response** `502 Bad Gateway`:
```json
{ "error": "Agent unreachable: <message>" }
```

---

### `POST /internal/agent-push`

**Internal only.** Receives the complete agent state after each evaluation cycle.

**Required header:** `x-internal-secret: <INTERNAL_SECRET from .env>`

**Request body** (`AgentPushPayload`):
```json
{
  "riskState": {
    "score": 35,
    "level": "MODERATE",
    "breakdown": {},
    "previousLevel": "LOW",
    "updatedAt": 1712841600000
  },
  "brief": null,
  "spaceWeather": {},
  "activeFlares": [],
  "activeCMEs": [],
  "neos": [],
  "timestamp": 1712841600000
}
```

**Response** `200 OK`:
```json
{ "received": true, "isAlert": false }
```

**Response** `403 Forbidden`:
```json
{ "error": "Forbidden" }
```

---

## Agent Endpoints (`:3002`)

These endpoints are primarily for internal use (gateway proxy) and debugging.

### `GET /health`
Agent uptime, last poll timestamps, and cache statistics.

### `GET /status`
Current `RiskState` from the risk engine.

**Response** `200 OK`:
```json
{
  "score": 35,
  "level": "MODERATE",
  "breakdown": {
    "solarFlare": 15,
    "geomagneticStorm": 5,
    "radiationStorm": 5,
    "solarWind": 5,
    "imfBz": 5,
    "neo": 0,
    "compoundBonus": 0
  },
  "previousLevel": "LOW",
  "updatedAt": 1712841600000
}
```

### `GET /brief`
Latest LLM-generated mission brief.

**Response** `404 Not Found`:
```json
{ "error": "No brief generated yet" }
```

### `POST /brief/generate`
Forces on-demand brief generation using Claude API (or deterministic fallback).

### `GET /data/:source`
Raw cached data for a specific source.

**Valid sources:** `swpc-xray`, `swpc-kp`, `swpc-protons`, `swpc-wind`, `swpc-mag`, `donki-flares`, `donki-cme`, `neows`, `eonet`

**Response** `400 Bad Request`:
```json
{ "error": "Unknown source. Valid: swpc-xray, swpc-kp, swpc-protons, swpc-wind, swpc-mag, donki-flares, donki-cme, neows, eonet" }
```

**Response** `404 Not Found`:
```json
{ "error": "No data cached for this source yet" }
```

### `GET /space-weather`
Processed `SpaceWeatherState` with classified values (X-ray class type, Kp numeric, etc.).

---

## Socket.io Events

### Server -> Client (Gateway `:3001`)

| Event | Trigger | Payload Type |
|-------|---------|-------------|
| `satellite-positions` | Every 10s + on connect | `SatPosition[]` — `{ id, name, lat, lng, alt }` |
| `risk-update` | Every agent evaluation (~5 min) | `{ score, level, breakdown, timestamp }` |
| `risk-alert` | Risk level changes | `{ level, score, brief, timestamp }` |
| `space-weather` | On new SWPC data from agent | `SpaceWeatherState` |

### Client -> Server
No client-to-server events defined. The frontend is read-only.

---

## Data Models

### RiskState

| Field | Type | Description |
|-------|------|-------------|
| `score` | `number` (0-100) | Composite risk score |
| `level` | `LOW` \| `MODERATE` \| `HIGH` \| `CRITICAL` | Risk classification |
| `breakdown` | `RiskBreakdown` | Per-source score breakdown |
| `previousLevel` | `RiskLevel` \| `null` | Previous level (for change detection) |
| `updatedAt` | `number` | Unix timestamp (ms) |

### RiskBreakdown

| Field | Type | Description |
|-------|------|-------------|
| `solarFlare` | `number` | Points from X-ray flux classification |
| `geomagneticStorm` | `number` | Points from Kp index |
| `radiationStorm` | `number` | Points from proton flux |
| `solarWind` | `number` | Points from solar wind speed |
| `imfBz` | `number` | Points from IMF Bz southward component |
| `neo` | `number` | Points from NEO proximity |
| `compoundBonus` | `number` | Synergistic bonus from multi-factor combinations |

### MissionBrief

| Field | Type | Description |
|-------|------|-------------|
| `recommendation` | `GO` \| `CAUTION` \| `NO-GO` | Mission recommendation |
| `summary` | `string` | 1-2 sentence plain-language assessment |
| `threats` | `Threat[]` | Identified threats with severity and time window |
| `maneuver_windows` | `ManeuverWindow[]` | Recommended satellite maneuvers |
| `confidence` | `number` (0-1) | Model confidence in the assessment |
| `generatedAt` | `number` | Unix timestamp (ms) |

### SatPosition

| Field | Type | Description |
|-------|------|-------------|
| `id` | `number` | NORAD catalog number |
| `name` | `string` | Satellite name |
| `lat` | `number` | Latitude (decimal degrees) |
| `lng` | `number` | Longitude (decimal degrees) |
| `alt` | `number` | Altitude (km) |

### SpaceWeatherState

| Field | Type | Description |
|-------|------|-------------|
| `xray` | `{ flux, classType, timestamp }` \| `null` | Latest X-ray flux reading |
| `kp` | `{ value, timestamp }` \| `null` | Latest Kp index |
| `protonFlux` | `{ flux, timestamp }` \| `null` | Latest >= 10 MeV proton flux |
| `solarWind` | `{ speed, density, timestamp }` \| `null` | Latest solar wind plasma |
| `bz` | `{ value, timestamp }` \| `null` | Latest IMF Bz GSM component |

---

## Error Format

All errors follow this shape:
```json
{ "error": "Human-readable description" }
```

## Rate Limiting

| Context | Status |
|---------|--------|
| Internal endpoints | No rate limiting (MVP) |
| External APIs | Respected by cron-scheduled pollers (see [`GOTCHAS.md`](GOTCHAS.md)) |
| Post-MVP | Add `express-rate-limit` if exposing gateway publicly |
