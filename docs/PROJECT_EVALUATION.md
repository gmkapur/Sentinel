# Project Evaluation

## Executive Summary

Orbit Sentinel is a real-time space situational awareness (SSA) dashboard that fuses publicly available space weather and orbital data into a compound risk scoring system with 3D globe visualization. The system ingests data from NOAA SWPC, NASA DONKI, CelesTrak, and NASA NeoWs to compute a 0–100 risk score using a multi-signal fusion engine with compound synergy rules (e.g., M5+ flare coinciding with LEO satellite on sunlit side). An LLM reasoning layer via Claude Sonnet generates structured GO/CAUTION/NO-GO mission briefs when risk levels change or score deltas exceed thresholds. The architecture splits into two Node.js microservices: a Gateway service (port 3001) handling client-facing REST and WebSocket (Socket.io) communication plus SGP4 satellite propagation via satellite.js v7 with CelesTrak OMM/JSON data; and an Agent service (port 3002) running cron-scheduled data pollers, the risk fusion engine, and the Claude API integration. The agent pushes fused risk state to the gateway via authenticated HTTP POST to an internal endpoint, which then broadcasts to all connected frontends. The React frontend renders a react-globe.gl 3D visualization with real-time satellite positions updated every 10 seconds and a risk overlay HUD. The project explicitly scopes itself to a 6-hour build sprint, targeting a functional MVP with live data, risk scoring, WebSocket alerts, and 3D visualization using only free APIs. Key technical decisions include using JSON/OMM over legacy TLE format for future-proofing against NORAD catalog number exhaustion, in-memory node-cache over Redis for zero-infrastructure dependency, and an agent-push model over a shared message bus for simplicity. The documentation is notably thorough with a GOTCHAS.md capturing non-obvious API behaviors, a detailed CONVENTIONS.md, and explicit architectural rationale for each design decision.

---

## PROJECT PLAN (12 Dimensions)

### 1. Vision Clarity — 85%

The mission statement is crisp and specific: make satellite mission risk analysis accessible using only free APIs, buildable in a single sprint. The north star — a credible SSA tool from free public data — is well-defined. The GO/CAUTION/NO-GO output paradigm gives a clear, actionable user-facing artifact. However, the vision stops at the demo boundary; there is no articulation of what Orbit Sentinel could become post-MVP or how it fits into a larger ecosystem of space safety tooling.

**Recommendation:** Add a "v2 vision" section describing a plausible 3–6 month evolution beyond the demo.

### 2. Technical Depth — 88%

The documentation demonstrates genuine technical depth: the risk engine's additive base scores and compound synergy rules are fully specified with numeric thresholds grounded in NOAA's established classification scales, the LLM trigger conditions (±15 score delta, 30-min heartbeat, level change) are precisely defined, and the architectural rationale for gateway-owned SGP4 propagation (latency sensitivity, frontend render loop coupling) is well-reasoned. The GOTCHAS.md shows real operational knowledge — DONKI 30-day cap, CelesTrak CORS absence, satellite.js v7 ESM-only, TLE catalog exhaustion timeline.

**Recommendation:** Ensure the API_REFERENCE.md includes actual endpoint schemas, request/response examples, and error codes.

### 3. Innovation — 72%

The multi-source data fusion with compound synergy bonuses (not just additive signal stacking) is a thoughtful design choice — recognizing that coincident events are more dangerous than their sum. Integrating Claude for structured GO/CAUTION/NO-GO mission briefs rather than raw score display adds a genuinely useful interpretation layer that most academic dashboards lack. However, the core idea — a space weather dashboard pulling from public APIs — is a well-explored category, and the individual components (react-globe.gl satellite visualization, SWPC/DONKI polling) have official examples the team explicitly references.

**Recommendation:** Consider differentiating the LLM layer further: prompt engineering that incorporates orbital mechanics context (satellite altitude, inclination band, mission type) into the brief generation would be novel.

### 4. Feasibility — 91%

The 6-hour sprint plan is detailed, hour-by-hour, with explicit "what to skip" guidance that demonstrates realistic scope management. The technology choices actively minimize setup friction: no Docker, no database, no Redis, free APIs with no approval process, and the team explicitly references the react-globe.gl official satellite example as a time anchor. The only genuine risk to feasibility is the Claude API integration — LLM calls add latency and potential API errors that need graceful degradation, which is documented. The two-service microservice split adds minor deployment complexity for a sprint, though the rationale for it is sound.

### 5. Scalability Design — 70%

The team explicitly acknowledges scalability limitations: in-memory cache precludes horizontal scaling, satellite.js SGP4 propagation is CPU-bound for large satellite counts, and LLM calls are the latency bottleneck. The path to scale (Redis, external session store, load balancer, service discovery, request queuing) is correctly identified. However, these are listed as future bullet points rather than a designed path — there is no indication of at what load thresholds the current architecture breaks, no back-of-envelope capacity estimate, and no prioritized migration order.

**Recommendation:** Add concrete capacity estimates (e.g., "current architecture handles ~X concurrent WebSocket clients before SGP4 propagation becomes the bottleneck") and a prioritized scaling roadmap.

### 6. Ecosystem Thinking — 65%

The inter-service API is well-defined (5 agent routes, internal push endpoint with shared secret auth), and the external dependency table with failure impact analysis shows good ecosystem awareness. However, there is no webhook support, no SDK, no developer documentation for third parties who might want to embed the risk score or brief in their own systems, and no extensibility design for adding new data sources beyond the current four.

**Recommendation:** Define a data source plugin interface in the agent that would allow adding new pollers without modifying riskEngine.ts.

### 7. Problem Definition — 82%

The problem statement is specific and accurate: space weather data is fragmented across government portals, requires domain expertise to interpret, and existing unified tools are either paywalled or absent. The competitive landscape is correctly named (LeoLabs, AGI, NASA DONKI, NOAA SWPC, CelesTrak) and their limitations are articulated. The affected personas — satellite operators, mission planners, space enthusiasts, educational institutions — are listed but not differentiated; a satellite operator and a space enthusiast have vastly different needs, risk tolerances, and technical contexts.

**Recommendation:** Sharpen the problem definition by picking a primary persona and describing their specific pain point in concrete workflow terms (e.g., "a CubeSat operator preparing for a firmware upload needs to know if a G3+ storm in the next 6 hours would fry their radio").

### 8. User Impact — 68%

The GO/CAUTION/NO-GO output format is genuinely actionable for mission operators, and the LLM brief with maneuver windows is a step above raw score display. However, the documentation does not quantify impact — no estimate of how many satellites are tracked, no articulation of what a false negative (missed CRITICAL event) costs, and no user research or validation that the compound risk formula aligns with how actual operators make decisions. The educational institution use case is plausible but underexplored.

**Recommendation:** Instrument the demo with a realistic scenario (e.g., the March 2024 G5 geomagnetic storm) and show what score and brief Orbit Sentinel would have generated, demonstrating concrete value.

### 9. Market Awareness — 75%

The competitive set is correctly identified: NASA DONKI, NOAA SWPC, LeoLabs, AGI/Ansys (STK). The positioning — credible SSA from free APIs in a sprint — is clear and differentiated from commercial platforms. The documentation correctly notes that CelesTrak SOCRATES is used instead of custom CDM analysis, showing awareness of the state of the art. However, there is no mention of SpaceAware, ExoAnalytic, or the growing number of academic SSA dashboards, and no analysis of why educational/enthusiast users would choose Orbit Sentinel over simply bookmarking the NOAA SWPC dashboard.

**Recommendation:** Add a brief positioning matrix comparing Orbit Sentinel on axes of cost, interpretability, and real-time fusion to sharpen competitive awareness.

### 10. Team Execution Plan — 78%

The 6-hour sprint plan is the strongest execution artifact in the documentation — it is hour-by-hour, with clear deliverables per phase and an explicit list of deferred features. The two-service microservice split suggests at least two parallel workstreams. However, there is no assignment of work to individuals (the documentation refers to "solo developer / sprint team" ambiguously), no definition of integration checkpoints between the gateway and agent services, and no contingency plan for what gets cut if Hour 3 slips.

**Recommendation:** Define at minimum a primary owner for each service and a specific integration test milestone (e.g., "by end of Hour 3, agent POST to /internal/agent-push must trigger a Socket.io event on the frontend").

### 11. Risk Assessment — 76%

The GOTCHAS.md is genuinely excellent risk mitigation documentation — it captures API-level failure modes (DONKI 30-day cap, CelesTrak CORS, satellite.js ESM-only, Space-Track rate limit behavior) with specific correct approaches. The external dependency table includes failure impact analysis for each service. The graceful degradation strategy (serve stale cache on poller failure) is explicitly designed. However, technical API risks are well-covered while project execution risks are not — there is no mention of what happens if the Claude API key has no credits, if CelesTrak is down during the demo, or if the react-globe.gl WebGL rendering fails in the demo browser.

**Recommendation:** Add a demo-day risk checklist with mitigations (e.g., "pre-cache a snapshot of all API data as fixture fallback for demo mode").

### 12. Differentiation Strategy — 74%

The compound synergy rules in the risk engine (not just additive signal stacking) and the LLM-generated structured mission briefs are the two primary differentiators, and both are well-documented. The explicit acknowledgment that legacy tools are fragmented and require domain expertise positions Orbit Sentinel as an accessibility play. However, the differentiation strategy relies entirely on synthesis — all underlying data sources are public and the LLM integration pattern is common. There is no proprietary data, novel algorithm, or unique data source combination that a competitor couldn't replicate in a weekend.

**Recommendation:** Consider what unique insight the compound synergy rules encode (e.g., publish the risk formula methodology as a technical artifact) or add a data source that competitors lack (e.g., amateur radio Kp network data, satellite operator community feeds).

---

## AI Feedback Summary

Orbit Sentinel is a well-scoped, technically credible project with notably strong documentation discipline — the GOTCHAS.md alone demonstrates genuine operational knowledge of the API ecosystem that goes well beyond tutorial-level work. The risk engine's compound synergy rules and LLM brief integration are the strongest technical differentiators and should be the centerpiece of the demo.

**Key action items:**

1. **API Reference**: Ensure the API_REFERENCE.md is fully populated with endpoint schemas, request/response examples, and error codes — this is the primary artifact for evaluating API design quality.

2. **Demo scenario**: Prepare a pre-recorded or fixture-driven scenario using a real historical event (the May 2024 G5 storm is ideal) to concretely show what score and GO/CAUTION/NO-GO brief the system would have generated — this transforms an interesting tool into a compelling demonstration of real-world value.

3. **Primary persona**: Tighten the primary persona from four vague groups to one specific user (e.g., a university CubeSat operations team) to make the impact story more concrete and persuasive.

4. **Competitive positioning**: Add a positioning matrix comparing Orbit Sentinel against alternatives on axes of cost, interpretability, and real-time data fusion.

5. **Scaling estimates**: Include back-of-envelope capacity estimates and a prioritized scaling roadmap with concrete thresholds.

6. **Demo-day preparedness**: Create a risk checklist with fixture fallbacks for all external API dependencies.

---

## Dimension Scores Summary

| Dimension | Score | Priority Action |
|-----------|-------|----------------|
| Feasibility | 91% | — |
| Technical Depth | 88% | Complete API reference |
| Vision Clarity | 85% | Add v2 vision |
| Problem Definition | 82% | Pick primary persona |
| Team Execution Plan | 78% | Define integration checkpoints |
| Risk Assessment | 76% | Add demo-day risk checklist |
| Market Awareness | 75% | Add positioning matrix |
| Differentiation Strategy | 74% | Publish risk formula methodology |
| Innovation | 72% | Differentiate LLM layer with orbital context |
| Scalability Design | 70% | Add capacity estimates |
| User Impact | 68% | Demo with historical storm scenario |
| Ecosystem Thinking | 65% | Define data source plugin interface |
