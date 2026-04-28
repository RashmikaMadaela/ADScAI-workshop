---
description: "Use when implementing or modifying the Pickup Time Slots feature (Phase 1 or Phase 2). Covers slot rules, validation, capacity, time helpers, and acceptance criteria."
---

# Pickup Time Slots — Business Rules & Guardrails

Full spec: `workshop/spec.md`. This file captures the binding decisions and traps to avoid.

## Phase Status

- **Phase 1** — `pickupAt` field on `Order`, slot picker in cart UI, display on orders page
- **Phase 2** — Capacity cap (`SLOT_CAPACITY = 10`), `slotAvailability`, `/api/orders/slots`, UI fetches live data

## Files Touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `pickupAt DateTime?` on `Order` |
| `src/types/index.ts` | `pickupAt?: string` on `CreateOrderInput` |
| `src/lib/services/order.ts` | All slot helpers, validation, capacity enforcement |
| `src/app/api/orders/route.ts` | Forward `pickupAt`, try/catch → 400 |
| `src/app/api/orders/slots/route.ts` | New Phase 2 route |
| `src/app/menu/_components/menu-client.tsx` | Slot picker UI |
| `src/app/orders/page.tsx` | Display `pickupAt` on order cards |

---

## Time Helpers — Required Implementations

### `floorToSlot(d: Date): Date`
Truncates a `Date` to the nearest 15-minute boundary using **local time** methods.

```ts
function floorToSlot(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(Math.floor(out.getMinutes() / 15) * 15, 0, 0);
  return out;
}
```

Used in: service validation, client-side slot filter.

### `generateLunchSlots(date: Date): Date[]`
Returns the 10 slot boundaries (11:30, 11:45, …, 13:45) for the given **local** date.

```ts
function generateLunchSlots(date: Date): Date[] {
  const slots: Date[] = [];
  for (let h = 11; h <= 13; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 11 && m < 30) continue;   // start at 11:30
      if (h === 13 && m > 45) break;       // end at 13:45
      const s = new Date(date);
      s.setHours(h, m, 0, 0);
      slots.push(s);
    }
  }
  return slots; // 10 items
}
```

Exported from `src/lib/services/order.ts`. Used by the Phase 2 slots API route and tests. **Never duplicate this logic.**

### `formatPickupTime(d: Date | string): string`
Uses `Intl` only — no date libraries.

```ts
function formatPickupTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}
// produces "12:30 PM"
```

---

## `pickupAt` Validation Rules (service layer)

When `pickupAt` is provided in `OrderService.create`, validate ALL of the following (throw descriptive `Error` on any failure):

1. Parses to a valid `Date` — `!isNaN(parsed.getTime())`
2. Minutes ∈ `{0, 15, 30, 45}` AND seconds === 0 AND milliseconds === 0
3. `parsed >= floorToSlot(new Date())` — not in the past (active in-progress slot is still valid)
4. Slot falls within lunch window on today's local date: `>= 11:30` and `<= 13:45`

Validation fires before the transaction. Only the DB query and `order.create` go inside `prisma.$transaction()`.

---

## Capacity Enforcement (Phase 2)

- `SLOT_CAPACITY = 10` — defined once at module level in `src/lib/services/order.ts`. **No magic numbers anywhere else.**
- Capacity check and order creation run inside a single `prisma.$transaction(tx => ...)`.
- Inside transaction: call `slotAvailability` using `tx`, not global `prisma`.
- If `count >= SLOT_CAPACITY`, throw `Error("slot is full")` — transaction rolls back automatically.

```ts
const SLOT_CAPACITY = 10;

return prisma.$transaction(async (tx) => {
  // Phase 1 validation (pure, no DB) happens before this
  if (pickupAt) {
    const counts = await OrderService.slotAvailabilityTx(tx, date);
    if ((counts[slot.toISOString()] ?? 0) >= SLOT_CAPACITY) {
      throw new Error("slot is full");
    }
  }
  return tx.order.create({ ... });
});
```

---

## `slotAvailability` Method (Phase 2)

```ts
static async slotAvailability(date: Date): Promise<Record<string, number>>
```

- Queries `prisma.order.groupBy` on `pickupAt`
- Window: `start = date with setHours(11, 30, 0, 0)`, `end = date with setHours(13, 45, 0, 0)`
- Returns `{ slot.toISOString(): count }` — absent = 0 (no zero-count entries needed)

---

## Slots API — `GET /api/orders/slots` (Phase 2)

Route: `src/app/api/orders/slots/route.ts`

- Protected with `withAuth`
- Optional `?date=YYYY-MM-DD` param; defaults to today
- **Parse date as local**: `const [y, m, d] = param.split("-").map(Number); new Date(y, m - 1, d)` — NEVER `new Date("YYYY-MM-DD")` (that's UTC midnight, wrong for timezones east of UTC)
- Returns array of 10 slot objects — all slots including past ones:

```json
[
  { "time": "2026-04-28T08:30:00.000Z", "available": true,  "remaining": 10 },
  { "time": "2026-04-28T08:45:00.000Z", "available": false, "remaining": 0  }
]
```

- `available`: `false` when `slot < floorToSlot(now)` (past) **OR** `count >= SLOT_CAPACITY` (full)
- `remaining`: `Math.max(0, SLOT_CAPACITY - count)`
- `time`: `slot.toISOString()`

---

## UI Rules — Slot Picker

**Phase 1 (client-side generation):**
- Generate slots client-side using `floorToSlot(new Date())` filter
- Render pill buttons in the sticky cart bar between total and "Place order →"
- Selected pill is highlighted; clicking selected pill deselects it (→ `null`)
- No slot selected = order placed without `pickupAt`
- Success message: `"Order placed. Pick up at 12:30 PM."` if slot selected, else `"Order placed. We'll have it ready shortly."`

**Phase 2 (server-driven):**
- Fetch `GET /api/orders/slots` on mount via `useEffect`, only when `!!session?.user`
- `slots` state: `SlotInfo[] | null` (null = loading)
- Loading → render `"Loading slots…"` in picker area; **do NOT disable "Place order →"**
- Fetch error → `slots = []`, render `"Slots unavailable"`, order without slot proceeds normally
- After successful order → re-fetch slots to refresh counts

**Pill display rules:**
- `available: false` → disabled + muted style, clicks ignored entirely (one rule — no special-casing past vs. full)
- `available: true && remaining >= 1 && remaining <= 3` → show `"X left"` scarcity badge
- `available: true && remaining > 3` → normal selectable style
- `remaining === 0` → pill already disabled; do NOT show "0 left" badge

---

## Orders Page Display

- Add `formatPickupTime` helper (see above)
- Below `createdAt` date, show: `Pickup: 12:30 PM` — only when `pickupAt` is non-null
- **Do not show** "No pickup time selected" or any fallback text

---

## Acceptance Criteria Checklist

### Phase 1
- [ ] Order placed without slot (backward compatible)
- [ ] Order placed with slot → pickup time appears on orders page
- [ ] Only `>= floorToSlot(now)` slots shown; active in-progress slot remains visible
- [ ] Invalid `pickupAt` in POST body → `400` with descriptive message
- [ ] `pickupAt` with non-zero seconds/milliseconds → `400`
- [ ] `pickupAt` persisted correctly and returned in GET `/api/orders`

### Phase 2
- [ ] Slots with 10+ orders shown as disabled in UI
- [ ] POST to full slot → `400 "slot is full"`
- [ ] `GET /api/orders/slots` returns correct `remaining` counts
- [ ] 1–3 remaining → count badge shown; 0 remaining → no badge (pill disabled)
- [ ] Past slots → `available: false`, non-interactive
- [ ] `SLOT_CAPACITY` defined in exactly one place
- [ ] Concurrent POSTs cannot both succeed for the 10th spot (transaction enforces this)
