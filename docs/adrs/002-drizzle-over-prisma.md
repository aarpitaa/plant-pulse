# ADR-002: Drizzle ORM Over Prisma

**Status:** Accepted  
**Date:** 2026-03-18  
**Author:** Backend Engineering  
**Deciders:** Platform Lead, Backend Lead

---

## Context

The API server and DB schema require a TypeScript-native ORM that integrates well with our Zod-based validation strategy and can run in a Node.js/ESM environment.

Candidates: Drizzle ORM, Prisma, TypeORM, Kysely.

---

## Decision

**Drizzle ORM** with `drizzle-zod` for schema-to-Zod derivation.

---

## Rationale

| Criterion | Drizzle | Prisma | Kysely |
|-----------|---------|--------|--------|
| ESM-native | ✅ | ⚠️ Requires config | ✅ |
| Zod schema derivation | ✅ `drizzle-zod` | ⚠️ Manual | ❌ |
| Bundle size | ✅ ~50KB | ❌ ~5MB+ | ✅ |
| Raw SQL escape hatch | ✅ `sql` tag | ⚠️ `$queryRaw` | ✅ |
| Schema push for dev | ✅ `drizzle-kit push` | ✅ `prisma db push` | ❌ |
| Migration file generation | ✅ | ✅ | ✅ |
| Type inference quality | ✅ Excellent | ✅ Good | ✅ Good |

The `drizzle-zod` integration allows us to derive insert/select Zod schemas directly from table definitions, eliminating duplicate schema maintenance between the ORM and API validation layer.

---

## Consequences

**Positive:**
- Single source of truth: DB schema → Zod validators
- ESM-compatible, no build step complexity
- Lightweight runtime footprint

**Negative:**
- Drizzle is newer and less battle-tested than Prisma
- Fewer third-party integrations (e.g., no Prisma Pulse equivalent)

**Mitigation:**
- Snapshot all migrations before production deploys
- Maintain `drizzle-kit generate` artifacts in version control
