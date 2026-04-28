# Canteen Pre-Order App — Copilot Instructions

## Project Overview

Next.js 14 (App Router) canteen pre-order system. Students browse a menu, build a cart, and place orders. The active feature being shipped is **Pickup Time Slots** (Phase 1 + Phase 2) — see `workshop/spec.md` for the full spec.

## Tech Stack

- **Framework**: Next.js 14 App Router, TypeScript
- **Database**: SQLite via Prisma ORM (`prisma/schema.prisma`)
- **Auth**: better-auth — always wrap API routes with `withAuth` from `src/lib/auth/wrappers.ts`
- **Tests**: Vitest (`vitest.config.ts` for unit, `vitest.integration.config.ts` for integration)
- **Styling**: Plain CSS variables (no Tailwind, no component libraries)

## Architecture

```
src/
  app/           # Next.js App Router pages and API routes
    api/         # Route handlers — all protected with withAuth
  lib/
    services/    # Business logic (OrderService, MenuService) — pure TS classes
    auth/        # better-auth config, client, withAuth wrapper
  types/         # Shared TypeScript types
prisma/          # Schema + migrations + seed
```

## Build & Test Commands

```bash
npm run dev          # development server
npm run build        # production build
npm test             # unit tests (vitest)
npx prisma migrate dev --name <name>   # create + apply migration
npx prisma generate  # regenerate Prisma client
```

## Key Conventions

- **Services are static class methods**: `OrderService.create(...)`, not instances
- **API routes use `withAuth` wrapper**: passes `AuthContext` (`{ userId, user }`) as second argument
- **No date libraries** (`date-fns`, `moment`, etc.) — use `Intl` API and plain `Date`
- **No extra dependencies** unless absolutely unavoidable
- **`pickupAt` is always local time** — use `setHours`/`getHours`, never UTC methods for slot boundaries
- **`SLOT_CAPACITY = 10`** lives only in `src/lib/services/order.ts` — no magic numbers elsewhere
- **Transactions for capacity checks**: wrap count + create inside `prisma.$transaction()` in `OrderService.create`

## Active Feature: Pickup Time Slots

See `workshop/spec.md` for complete spec. Implementation instructions are in:
- `.github/instructions/pickup-slots.instructions.md` — business rules and acceptance criteria
- `.github/instructions/prisma-patterns.instructions.md` — DB/migration patterns
- `.github/instructions/api-routes.instructions.md` — API route conventions
- `.github/instructions/ui-patterns.instructions.md` — React/UI conventions
