# Code Conventions

> **Principle**: Only document conventions that DEVIATE from the language/framework defaults.
> Standard patterns (e.g., React components in PascalCase) don't need to be listed —
> agents infer these from existing code. Focus on the surprising or non-standard.

## File & Directory Naming
- [FILL: e.g., "All filenames use kebab-case: `user-service.ts`, not `userService.ts`"]
- [FILL: e.g., "Test files co-located with source: `foo.ts` → `foo.test.ts`"]
- [FILL: e.g., "Each module gets its own directory with an `index.ts` barrel export"]

## Code Organization Patterns

### Module Structure
<!-- How should a new feature/module be organized? -->
```
[FILL: example of a well-structured module]

Example:
src/features/auth/
├── auth.controller.ts     # HTTP handlers (thin, delegates to service)
├── auth.service.ts        # Business logic
├── auth.repository.ts     # Database queries
├── auth.types.ts          # Types/interfaces for this module
├── auth.validation.ts     # Input validation schemas
├── auth.test.ts           # Tests
└── index.ts               # Public exports only
```

### Import Order
<!-- If you enforce a specific import order. -->
[FILL: e.g., "
1. Node/runtime built-ins
2. External packages
3. Internal aliases (@/...)
4. Relative imports
Blank line between each group. Enforced by ESLint import-order rule.
"]

## Naming Conventions
<!-- Only list deviations from standard. -->
- [FILL: e.g., "Database columns use snake_case, TypeScript properties use camelCase"]
- [FILL: e.g., "API routes use kebab-case: `/user-profiles`, not `/userProfiles`"]
- [FILL: e.g., "Environment variables prefixed with `SENTINEL_` for app-specific vars"]
- [FILL: e.g., "Boolean variables/props prefixed with `is`, `has`, `should`"]

## Error Handling
- [FILL: e.g., "Use custom error classes extending `AppError` (see `src/errors/`)"]
- [FILL: e.g., "Never throw raw strings — always throw Error instances"]
- [FILL: e.g., "API errors return `{ error: { code, message, details? } }` format"]
- [FILL: e.g., "Use Result types for expected failures, throw for unexpected ones"]

## Async Patterns
- [FILL: e.g., "Always use async/await, never raw Promises with .then()"]
- [FILL: e.g., "Database operations must be wrapped in transactions for multi-step mutations"]

## Type Conventions
- [FILL: e.g., "Prefer interfaces over types for object shapes"]
- [FILL: e.g., "Use Zod schemas as the single source of truth, infer types with z.infer<>"]
- [FILL: e.g., "No `any` — use `unknown` and narrow with type guards"]

## Comments & Documentation
- [FILL: e.g., "No JSDoc unless it's a public API. Code should be self-documenting."]
- [FILL: e.g., "Use `// TODO(name):` format for todos, linked to an issue number"]
- [FILL: e.g., "Comment the WHY, never the WHAT"]

## Dependency Rules
<!-- What should agents know about adding or changing dependencies? -->
- [FILL: e.g., "Prefer stdlib over npm packages for simple operations"]
- [FILL: e.g., "New dependencies require team approval — add justification to PR description"]
- [FILL: e.g., "Zero tolerance for packages with known vulnerabilities"]
