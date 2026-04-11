# API Reference

## Overview
- **Base URL**: [FILL: e.g., `http://localhost:3000/api` (dev), `https://api.sentinel.io` (prod)]
- **API style**: [FILL: e.g., REST, GraphQL, gRPC, tRPC]
- **Authentication**: [FILL: e.g., "Bearer token in Authorization header"]
- **Content type**: [FILL: e.g., `application/json`]
- **API versioning**: [FILL: e.g., "URL prefix `/v1/`, `/v2/`" or "Header-based" or "None"]

## Authentication

### Getting a Token
```bash
# [FILL: example request]
curl -X POST [BASE_URL]/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "..."}'
```

### Token Format
- **Type**: [FILL: e.g., JWT, opaque, session cookie]
- **Lifetime**: [FILL: e.g., "Access token: 15 min, Refresh token: 7 days"]
- **Refresh**: [FILL: e.g., "POST /auth/refresh with refresh token in body"]

### Authorization Model
- [FILL: e.g., "RBAC with roles: admin, member, viewer"]
- [FILL: e.g., "Resource-level permissions checked in middleware"]

## Endpoints

### [Resource Group 1: e.g., Users]

#### `[METHOD] [PATH]`
<!-- Repeat this block for each endpoint -->
[FILL: e.g., `GET /api/v1/users`]

**Description**: [FILL: what this endpoint does]
**Auth required**: [FILL: Yes/No, and required role if applicable]

**Query parameters**:
| Param | Type | Required | Description |
|-------|------|----------|-------------|
| [FILL] | [FILL] | [FILL] | [FILL] |

**Request body** (if applicable):
```json
{
  "[FILL: field]": "[FILL: type and description]"
}
```

**Success response** (`200`):
```json
{
  "data": [
    {
      "[FILL: field]": "[FILL: example value]"
    }
  ],
  "meta": {
    "total": 100,
    "cursor": "abc123"
  }
}
```

**Error responses**:
| Status | Code | Description |
|--------|------|-------------|
| 400 | `VALIDATION_ERROR` | [FILL: when this happens] |
| 401 | `UNAUTHORIZED` | [FILL] |
| 404 | `NOT_FOUND` | [FILL] |

### [Resource Group 2: e.g., Projects]
<!-- Repeat endpoint blocks -->

## Data Models

### [Model Name: e.g., User]
| Field | Type | Nullable | Description |
|-------|------|----------|-------------|
| `id` | UUID | No | Primary key |
| [FILL] | [FILL] | [FILL] | [FILL] |
| `created_at` | DateTime | No | ISO 8601 timestamp |
| `updated_at` | DateTime | No | ISO 8601 timestamp |

### [Model Name 2]
<!-- Repeat -->

## Common Patterns

### Pagination
- **Style**: [FILL: e.g., cursor-based, offset-based]
- **Default page size**: [FILL: e.g., 20]
- **Max page size**: [FILL: e.g., 100]
- **Example**: [FILL: `GET /users?cursor=abc123&limit=20`]

### Error Format
All errors follow this shape:
```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable description",
    "details": {}
  }
}
```

### Rate Limiting
- **Limits**: [FILL: e.g., "100 req/min per API key"]
- **Headers**: [FILL: e.g., "`X-RateLimit-Remaining`, `X-RateLimit-Reset`"]
- **Exceeded response**: [FILL: e.g., "429 Too Many Requests"]

## Webhooks (if applicable)
- **Endpoint**: [FILL: e.g., "Configurable per organization in settings"]
- **Events**: [LIST: e.g., `user.created`, `project.updated`, `task.completed`]
- **Signature**: [FILL: e.g., "HMAC-SHA256 in `X-Webhook-Signature` header"]
- **Retry policy**: [FILL: e.g., "3 retries with exponential backoff"]
