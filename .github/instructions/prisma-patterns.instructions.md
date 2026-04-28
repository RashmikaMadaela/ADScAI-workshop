---
description: "Use when modifying prisma/schema.prisma, creating migrations, writing Prisma queries, or using prisma.$transaction(). Covers SQLite patterns, local-time date queries, and capacity-check transactions."
applyTo: "prisma/**"
---

# Prisma Patterns

## Schema Conventions

- Use `cuid()` for all `@id` fields
- Add `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` to every model
- Nullable fields use `?`: `pickupAt DateTime?`
- Relations must have `onDelete: Cascade` where parent deletion should remove children (e.g. `OrderItem` → `Order`)
- Always add `@@index` for foreign key fields used in `WHERE` clauses (e.g. `@@index([userId])`)

## Migration Workflow

```bash
# After every schema change:
npx prisma migrate dev --name <descriptive-name>
npx prisma generate   # regenerate client
```

- Never edit migration SQL files after they've been committed
- Migration name should describe what changed: `add_pickup_at_to_order`, not `update1`
- Run `npx prisma generate` after any migration to keep the client in sync

## Querying with Local-Time Date Boundaries

**CRITICAL**: SQLite stores `DateTime` as UTC. When filtering by a local date range (e.g., today's lunch window), compute boundaries using **local-time** `setHours` — never `setUTCHours`.

```ts
// CORRECT — local time boundaries
const start = new Date(date); start.setHours(11, 30, 0, 0);
const end   = new Date(date); end.setHours(13, 45, 0, 0);

await prisma.order.findMany({
  where: { pickupAt: { gte: start, lte: end } }
});
```

```ts
// WRONG — UTC boundaries (breaks for timezones east of UTC)
const start = new Date(date); start.setUTCHours(11, 30, 0, 0);
```

## `groupBy` for Slot Counts

Use `groupBy` + `_count` to count orders per slot in one query:

```ts
const rows = await prisma.order.groupBy({
  by: ["pickupAt"],
  where: { pickupAt: { gte: start, lte: end, not: null } },
  _count: { pickupAt: true },
});
// Convert to map: { slot.toISOString() → count }
const counts: Record<string, number> = {};
for (const row of rows) {
  if (row.pickupAt) counts[row.pickupAt.toISOString()] = row._count.pickupAt;
}
```

## Transactions for Capacity Checks

Wrap **count check + insert** in a single `prisma.$transaction()`. SQLite serialises write transactions — this eliminates the check-then-create race without extra locking.

```ts
return prisma.$transaction(async (tx) => {
  // Use tx — NOT prisma — for every query inside
  const rows = await tx.order.groupBy({ ... });
  if (count >= SLOT_CAPACITY) throw new Error("slot is full");
  return tx.order.create({ ... });
});
```

Rules:
- All DB queries inside the callback must use `tx`, not the global `prisma` client
- Throwing inside `$transaction` automatically rolls back
- Pure validation (no DB) can run before the transaction

## Prisma Client Import

Always import from `@/lib/prisma`:

```ts
import { prisma } from "@/lib/prisma";
```

Never instantiate `new PrismaClient()` outside `src/lib/prisma.ts`.
