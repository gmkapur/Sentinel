# Code Conventions

> **Principle**: Only document conventions that DEVIATE from the language/framework defaults.
> Standard patterns (e.g., React components in PascalCase) don't need to be listed —
> agents infer these from existing code. Focus on the surprising or non-standard.

## File & Directory Naming
- All filenames use kebab-case: `risk-engine.js`, not `riskEngine.js`
- React components use PascalCase: `Globe.jsx`, `AlertPanel.jsx`
- Test files co-located in `tests/` directory, mirroring source structure: `tests/unit/risk-engine.test.js`
- Pollers each get their own file named after the data source: `swpc.js`, `donki.js`, `celestrak.js`

## Code Organization Patterns

### Module Structure
```
server/
├── pollers/
│   ├── swpc.js           # Fetch + parse + cache for one data source
│   ├── donki.js
│   ├── celestrak.js
│   └── neows.js
├── routes/
│   ├── status.js         # One file per REST endpoint group
│   ├── space-weather.js
│   ├── alerts.js
│   └── satellite.js
├── risk-engine.js        # Standalone scoring module
└── index.js              # Server setup, cron registration, Socket.io init
```

### Import Order
1. Node built-ins (`import { readFileSync } from 'fs'`)
2. External packages (`import express from 'express'`)
3. Internal modules (`import { computeRisk } from './risk-engine.js'`)

Blank line between each group.

## Naming Conventions
- API route paths use kebab-case: `/api/space-weather`, not `/api/spaceWeather`
- Environment variables use UPPER_SNAKE_CASE: `NASA_API_KEY`, `SPACE_TRACK_USER`
- Cache keys use colon-delimited namespaces: `swpc:xray`, `donki:flares`, `celestrak:tle:25544`
- Risk levels are uppercase string constants: `LOW`, `MODERATE`, `HIGH`, `CRITICAL`
- Socket.io event names use kebab-case: `risk-alert`, `risk-update`

## Error Handling
- Pollers catch all errors and log them — never let a failed API call crash the server
- Serve stale cached data when an API is down (graceful degradation)
- API routes return `{ error: { code, message } }` format on failure
- Never throw raw strings — always throw Error instances

## Async Patterns
- Always use async/await, never raw Promises with `.then()`
- Pollers are independent — a failure in one never blocks others
- Use try/catch in every poller function with logging on catch

## Data Format Conventions
- Always use JSON/OMM format from CelesTrak, never legacy TLE text strings
- Parse OMM with `satellite.js` v7's `json2satrec()`, not `twoline2satrec()`
- Dates in API responses use ISO 8601 format
- Coordinates use decimal degrees (latitude, longitude) and kilometers (altitude)

## Dependency Rules
- Keep backend dependencies minimal (7 total for MVP)
- No Redis, no database, no BullMQ — use in-memory alternatives
- Prefer native Node.js features over npm packages (e.g., native `fetch` for simple cases, though `axios` is used for consistency)
- All external data fetching goes through server-side pollers — never from the client
