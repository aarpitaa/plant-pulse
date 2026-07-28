# ADR-003: Orval for OpenAPI Codegen

**Status:** Accepted  
**Date:** 2026-04-02  
**Author:** Frontend Engineering  
**Deciders:** Frontend Lead, Backend Lead

---

## Context

We maintain a single OpenAPI spec in `lib/api-spec/openapi.yaml` and need both:
1. React Query hooks for the operations UI
2. Zod validators for the API server (request body / query param validation)

Generating these from a single spec reduces drift between client and server.

Candidates: Orval, openapi-typescript, swagger-codegen.

---

## Decision

**Orval v8** configured with two output targets:
- `lib/api-client-react` → React Query hooks + TypeScript types
- `lib/api-zod` → Zod validators

---

## Known Quirks (Important for Future Maintainers)

### 1. `type: integer` causes Zod v4 incompatibility
Orval 8.23 generates `zod.int()` for `type: integer` properties, which is a Zod v4 method but our project uses `zod` v3 API. **Always use `type: number`** in the OpenAPI spec.

### 2. Path params + query params naming collision
Operations with both path params AND query params cause Orval to generate a `Params` type from each, creating a TS2308 export collision in the barrel. Workaround: restructure to use query-only params (e.g., `/telemetry?machineId=...` instead of `/machines/{machineId}/telemetry`).

### 3. Request body schema names must be entity-shaped
Orval uses the `$ref` name as the TypeScript type name. Use `IncidentInput`, `IncidentUpdate` etc. — never operation-shaped names like `CreateIncidentBody` as request bodies (the Zod export will conflict with the generated input name).

---

## Regenerating

```bash
pnpm --filter @workspace/api-spec run codegen
```

This runs `orval --config orval.config.ts` from `lib/api-spec/`. Do not edit generated files in `*/src/generated/`.
