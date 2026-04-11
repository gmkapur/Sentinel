# Project Overview

## Mission Statement
Orbit Sentinel exists to make satellite mission risk analysis accessible to everyone by fusing free, publicly available space weather and orbital data into a real-time risk scoring dashboard with 3D visualization. It demonstrates that a credible space situational awareness tool can be built entirely on free APIs in a single sprint.

## Problem Statement
- **The problem**: Space weather events (solar flares, geomagnetic storms, radiation belt enhancements) pose real risks to satellite missions, but existing tools are either expensive commercial products, fragmented across dozens of government data portals, or require deep domain expertise to interpret.
- **Who it affects**: Satellite operators, mission planners, space enthusiasts, and educational institutions who need a unified view of space environment threats.
- **Current alternatives**: NASA DONKI and NOAA SWPC provide raw data but no fusion or risk scoring. Commercial SSA platforms (LeoLabs, AGI) are expensive. CelesTrak provides orbital data but no threat correlation.

## Goals & Non-Goals

### Goals
1. Build a working satellite risk analysis MVP in 6 hours using only free APIs
2. Fuse data from multiple sources (SWPC, DONKI, CelesTrak) into a compound risk score (0–100)
3. Provide real-time 3D globe visualization of satellite positions with risk overlays
4. Deliver real-time alerts via WebSocket when risk levels change

### Non-Goals
1. Production-grade infrastructure (no Docker, no database persistence, no Redis)
2. Real conjunction assessment (use SOCRATES reports, not custom CDM analysis)
3. Full Space-Track integration (use CelesTrak as the zero-auth proxy)
4. Comprehensive test coverage (MVP ships without tests)

## Success Metrics
- All data pollers successfully fetch and cache data from SWPC, DONKI, and CelesTrak
- Risk scoring engine produces accurate 0–100 scores using NOAA's established thresholds
- 3D globe renders satellite positions updated in real-time via requestAnimationFrame
- WebSocket alerts fire within seconds of risk level changes
- Application runs stably with graceful degradation when individual APIs are down

## Key Stakeholders
- **Owner**: Solo developer / sprint team
- **Contributors**: Open-source contributors
- **Users**: Satellite operators, space weather enthusiasts, educational institutions

## Project Status
- **Phase**: MVP
- **Started**: April 2026
- **Target milestone**: 6-hour functional MVP with live data, risk scoring, and 3D visualization

## Links
- Repository: This repo
- Issue tracker: GitHub Issues
- Design docs: `docs/` directory
- Production URL: N/A (local development)
