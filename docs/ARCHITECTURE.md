# Architecture

## System Overview
<!-- High-level diagram description. What are the major components and how do they connect? -->
```
[FILL: ASCII diagram of your system architecture]

Example:
┌─────────┐     ┌─────────┐     ┌──────────┐
│  Client  │────▶│   API   │────▶│ Database │
│  (Web)   │◀────│ Server  │◀────│ (Postgres)│
└─────────┘     └────┬────┘     └──────────┘
                     │
                     ▼
                ┌─────────┐
                │  Queue   │
                │ (Redis)  │
                └─────────┘
```

## Core Components

### [Component 1 Name]
<!-- Repeat this block for each major component/service -->
- **Purpose**: [DESCRIBE: what this component does]
- **Entrypoint**: `[FILL: file path, e.g., src/api/server.ts]`
- **Key files**:
  - `[FILL: path]` — [DESCRIBE: role]
  - `[FILL: path]` — [DESCRIBE: role]
- **Depends on**: [LIST: other components this talks to]
- **Depended on by**: [LIST: what calls this component]

### [Component 2 Name]
- **Purpose**: [DESCRIBE]
- **Entrypoint**: `[FILL]`
- **Key files**: [FILL]

## Data Flow
<!-- Describe the primary data path through the system. -->

### Request Lifecycle
1. [FILL: e.g., "Client sends HTTP request to API gateway"]
2. [FILL: e.g., "Gateway validates auth token via middleware"]
3. [FILL: e.g., "Controller dispatches to service layer"]
4. [FILL: e.g., "Service queries database via repository pattern"]
5. [FILL: e.g., "Response serialized and returned"]

### Background Processing
<!-- If applicable: async jobs, event-driven flows, etc. -->
- [FILL: e.g., "Webhook events → Redis queue → Worker processes"]

## Database Schema
<!-- High-level entity relationships. Detail goes in API_REFERENCE.md. -->
- **Primary entities**: [LIST: e.g., User, Organization, Project, Task]
- **Key relationships**: [DESCRIBE: e.g., "User belongs to Organization (many-to-one)"]
- **Migration tool**: [FILL: e.g., Prisma, Alembic, Flyway]
- **Migration location**: `[FILL: path to migrations directory]`

## External Dependencies
<!-- Third-party services, APIs, infrastructure the system relies on. -->

| Service | Purpose | Failure Impact |
|---------|---------|----------------|
| [FILL: e.g., Stripe] | [FILL: payment processing] | [FILL: e.g., payments fail, orders queue] |
| [FILL: e.g., SendGrid] | [FILL: email delivery] | [FILL: e.g., emails delayed] |

## Key Design Decisions
<!-- Important architectural choices and WHY they were made. This is gold for AI agents. -->

### [Decision 1: e.g., "Why we use event sourcing"]
- **Context**: [DESCRIBE: what problem prompted the decision]
- **Decision**: [DESCRIBE: what was chosen]
- **Rationale**: [DESCRIBE: why this over alternatives]
- **Trade-offs**: [DESCRIBE: what was sacrificed]

### [Decision 2]
- **Context**: [FILL]
- **Decision**: [FILL]
- **Rationale**: [FILL]
- **Trade-offs**: [FILL]

## Scaling Considerations
- **Current capacity**: [FILL: e.g., "Handles ~1k req/s on single instance"]
- **Bottlenecks**: [FILL: known scaling limits]
- **Horizontal scaling**: [DESCRIBE: what can/cannot scale horizontally]
