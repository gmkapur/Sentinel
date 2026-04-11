# Security

> **For AI Agents**: This document defines security boundaries. When working on any code
> that touches authentication, authorization, data handling, or external services,
> read this document first and follow its constraints strictly.

## Authentication

### Auth Flow
- **Method**: [FILL: e.g., JWT with refresh tokens, session cookies, OAuth2 + PKCE]
- **Provider**: [FILL: e.g., custom, Auth0, Clerk, Supabase Auth, Firebase Auth]
- **Token storage (client)**: [FILL: e.g., "httpOnly secure cookie — NEVER localStorage"]
- **Token lifetime**: [FILL: e.g., "Access: 15 min, Refresh: 7 days, Session: 24 hours"]

### Auth Boundaries
- [FILL: e.g., "All `/api/*` routes require authentication except `/api/auth/*`"]
- [FILL: e.g., "Webhook endpoints use HMAC signature verification, not JWT"]
- [FILL: e.g., "Internal service-to-service calls use API keys, not user tokens"]

## Authorization

### Permission Model
- **Type**: [FILL: e.g., RBAC, ABAC, ACL, simple role check]
- **Roles**: [LIST: e.g., `admin`, `member`, `viewer`, `guest`]
- **Enforcement point**: [FILL: e.g., "Middleware checks role before controller runs"]

### Resource-Level Access
- [FILL: e.g., "Users can only access resources within their organization"]
- [FILL: e.g., "Admin endpoints require `admin` role AND `org_id` match"]
- [FILL: e.g., "Public resources are explicitly marked with `is_public: true`"]

## Data Protection

### Sensitive Data
<!-- What data is sensitive and how must it be handled? -->
| Data Type | Storage | Encryption | Access Control |
|-----------|---------|------------|----------------|
| Passwords | [FILL: e.g., bcrypt hash, never plaintext] | At rest | Auth service only |
| API keys | [FILL: e.g., hashed, prefix stored for lookup] | At rest | Owner only |
| PII | [FILL: e.g., encrypted columns] | At rest + transit | Role-based |
| [FILL] | [FILL] | [FILL] | [FILL] |

### Data Handling Rules
- [FILL: e.g., "Never log PII — sanitize before logging"]
- [FILL: e.g., "Never return password hashes in API responses"]
- [FILL: e.g., "Use parameterized queries — NEVER string interpolation for SQL"]
- [FILL: e.g., "Validate and sanitize ALL user input at the API boundary"]

## Input Validation
- **Validation library**: [FILL: e.g., Zod, Joi, class-validator]
- **Where validation happens**: [FILL: e.g., "Request validation middleware before controller"]
- **Rules**:
  - [FILL: e.g., "All string inputs are trimmed and length-limited"]
  - [FILL: e.g., "File uploads limited to 10MB, allowed types: jpg, png, pdf"]
  - [FILL: e.g., "IDs must match UUID v4 format"]

## OWASP Top 10 Mitigations
<!-- How does this project address common vulnerabilities? -->

| Vulnerability | Mitigation |
|--------------|------------|
| SQL Injection | [FILL: e.g., "ORM with parameterized queries. No raw SQL."] |
| XSS | [FILL: e.g., "React auto-escapes. CSP headers. No dangerouslySetInnerHTML."] |
| CSRF | [FILL: e.g., "SameSite cookies + CSRF token on state-changing requests"] |
| Broken Auth | [FILL: e.g., "Token rotation, short-lived access tokens, secure storage"] |
| Injection | [FILL: e.g., "Input validation on all boundaries, no eval(), no shell exec with user input"] |

## Secrets & Environment Variables
- **Secret storage**: [FILL: e.g., "AWS Secrets Manager for prod, .env.local for dev"]
- **Never committed**: `.env`, `*.pem`, `*.key`, `credentials.json`, `secrets.yaml`
- **Rotation**: [FILL: e.g., "API keys rotated quarterly, DB passwords on breach"]

## Security Headers
```
[FILL: list your security headers]

Example:
Content-Security-Policy: default-src 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

## Dependency Security
- [FILL: e.g., "Dependabot enabled for automated vulnerability scanning"]
- [FILL: e.g., "`npm audit` runs in CI — build fails on critical vulnerabilities"]
- [FILL: e.g., "New dependencies require security review in PR"]

## Incident Response
- **Security contact**: [FILL: email or Slack channel]
- **Reporting**: [FILL: e.g., "security@sentinel.io or responsible disclosure via HackerOne"]
- **Runbook location**: [FILL: e.g., "Internal wiki at [URL]"]
