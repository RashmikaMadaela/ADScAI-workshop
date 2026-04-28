# Workshop spec

## Feature: Pickup Time Slots

### Problem

Students pre-order food but have no way to specify *when* they want to collect it. The kitchen prepares everything at once, creating the same lunch-rush queue the app was meant to eliminate. Students show up blind — not knowing if their food is ready, still cooking, or whether the slot is even available.

### Goal

Let students choose a 15-minute pickup window when placing an order. Cap each window at a maximum number of orders so the kitchen load is spread across the lunch period. Surface slot availability in the UI before the student commits.

This resolves two compounding problems from student feedback:
- *"The line is unpredictable. Sometimes 5 minutes, sometimes 30. I never know when to leave class."*
- *"I would've ordered earlier if I knew the wait time."*

---

## Design decisions

These decisions resolve ambiguities in the original spec. They are binding — do not deviate from them during implementation.

### Timezone

Slots are **server local time**. "11:30–14:00" is a physical business rule for one canteen in one location. All slot boundaries are computed with JS local-time methods (`setHours`, `getHours`, etc.), not UTC methods. The `?date=YYYY-MM-DD` query param on the slots endpoint is parsed as a **local date** using `new Date(year, month - 1, day)` — **never** `new Date("YYYY-MM-DD")`, which parses as UTC midnight and will produce the wrong day for timezones east of UTC.

### "Future" slot definition

A slot is considered bookable if `slot >= floorToSlot(now)`, where `floorToSlot` truncates to the nearest 15-minute boundary. This means the slot currently in progress (e.g. 12:00 when it is 12:04) is still bookable — the kitchen has started that window and can still accept orders. Implement the helper:

```ts
function floorToSlot(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(Math.floor(out.getMinutes() / 15) * 15, 0, 0);
  return out;
}
```

Use this helper in both the service validation and the client-side slot filter.

### Slot value format

`pickupAt` is stored and transmitted as an ISO 8601 string. The parsed `Date` must have **minutes in {0, 15, 30, 45} and seconds === 0 and milliseconds === 0**. This enforces a clean boundary so `groupBy` in `slotAvailability` returns one row per real slot rather than fragmenting on sub-second variance. Reject any value that does not meet all three conditions.

### Concurrency — capacity enforcement

The capacity check and order creation in `OrderService.create` **must run inside a single `prisma.$transaction()`**. SQLite serialises write transactions, so the count each request sees is the committed state at transaction start — this eliminates the check-then-create race condition without any extra locking primitives.

```ts
return prisma.$transaction(async (tx) => {
  // Phase 2: count check using tx, not prisma
  // then: tx.order.create(...)
});
```

### Date formatting

Use the built-in `Intl` API — **no `date-fns` or other date library**. The project has no such dependency and one format call does not justify adding one. Format pickup times with:

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

### Scarcity badge threshold

Show the remaining-count badge only when `remaining >= 1 && remaining <= 3`. When `remaining === 0` the pill is already visually disabled — a "0 left" badge is redundant and confusing. Badge text: `"X left"`.

### Loading state scope

While the Phase 2 slot fetch is in progress, render `"Loading slots…"` text in the slot picker area. **Do not disable the "Place order →" button** during loading — the slot is optional and blocking the order flow would regress Phase 1 behaviour. If the fetch fails, show `"Slots unavailable"` and allow the user to order without a slot. If the user somehow submits a full slot, the API returns `400 "slot is full"` and the UI surfaces that as a normal order error.

### Disabled pill behaviour

Any pill with `available: false` — whether past or full — ignores click events. No error is shown; the pill is simply non-interactive. One rule, no special-casing between "past" and "full".

### Error handling in POST `/api/orders`

Wrap `OrderService.create` in a `try/catch`. Any thrown `Error` returns `{ error: e.message }` with status `400`. This covers both Phase 1 validation errors and the Phase 2 `"slot is full"` error.

### Shared slot generation utility

Define `generateLunchSlots(date: Date): Date[]` once, inside `src/lib/services/order.ts`. It returns all 15-minute boundaries from 11:30 to 13:45 inclusive for the given local date (10 slots total). Both the Phase 2 API endpoint and the Phase 1 client-side logic use identical rules — the client re-implements the filter in JS for Phase 1 since it has no server round-trip; the server uses the exported function directly in Phase 2.

---

## Phase 1 — Fixed slot picker with `pickupAt` on Order

### What it does

A slot selector appears inside the sticky cart bar on the menu page. The student picks a 15-minute window (e.g. 12:00, 12:15, 12:30…). That time is stored on the order. The orders page shows the pickup time alongside the order status.

### Slot rules

- Slots are generated for a fixed lunch window: **11:30 – 14:00**, in **15-minute increments** (10 slots: 11:30, 11:45, …, 13:45)
- Slots are relative to **today's local date** at order time
- A slot is shown only if `slot >= floorToSlot(now)` (see Design decisions — "Future" slot definition)
- Selecting a slot is **optional** — `pickupAt` is nullable so existing orders and tests are unaffected
- If no slot is selected, the cart bar still shows the "Place order →" button and the order is placed without a pickup time

### Schema change

Add one nullable field to `Order` in `prisma/schema.prisma`:

```prisma
model Order {
  // ... existing fields ...
  pickupAt   DateTime?   // new — the student's chosen pickup window
}
```

Run a new Prisma migration after this change.

### Type change

Extend `CreateOrderInput` in `src/types/index.ts`:

```ts
export type CreateOrderInput = {
  items: Array<{ menuItemId: string; quantity: number }>;
  notes?: string;
  pickupAt?: string; // ISO 8601 string, validated server-side
};
```

### Service change — `OrderService.create`

`src/lib/services/order.ts`

- Accept `pickupAt?: string` in the `args` object alongside the existing `userId`, `items`, and `notes`
- If `pickupAt` is provided, validate all of the following (throw a descriptive `Error` on any failure):
  1. Parses to a valid `Date` (not `NaN`)
  2. Minutes are in `{0, 15, 30, 45}`, seconds are `0`, milliseconds are `0`
  3. The slot is `>= floorToSlot(new Date())` (not in the past — use the helper from Design decisions)
  4. The slot falls within the lunch window (11:30–13:45) on today's local date
- Pass the parsed `Date` as `pickupAt` to `prisma.order.create`
- Keep forwarding `notes` — the `pickupAt` addition is additive, not a replacement
- In Phase 2 the `prisma.order.create` call moves inside a `prisma.$transaction()` — structure the function so this is a clean refactor

### API change — POST `/api/orders`

`src/app/api/orders/route.ts`

- Read `body.pickupAt` (optional string) and forward it alongside `body.notes` to `OrderService.create`
- Wrap `OrderService.create` in a `try/catch`; on any thrown `Error` return `{ error: e.message }` with status `400`

### UI change — `MenuClient`

`src/app/menu/_components/menu-client.tsx`

- Add `pickupAt: string | null` to component state, initialised to `null`
- Generate available slots client-side: apply `floorToSlot(new Date())` to filter, show only slots `>= floorToSlot(now)` within the 11:30–13:45 window
- Render a row of pill buttons inside the sticky cart bar (between the total and the "Place order →" button), one per available slot; if no slots remain in the window, render nothing
- Selected slot pill is highlighted; clicking the selected pill deselects it (sets state back to `null`)
- Include `pickupAt` (the ISO string of the selected slot `Date`) in the POST body when placing the order
- After a successful order, reset `pickupAt` to `null`
- Update the success message: if a slot was chosen, show *"Order placed. Pick up at 12:30 PM."*; otherwise show the existing *"Order placed. We'll have it ready shortly."*

### Orders page display

`src/app/orders/page.tsx`

- Add a `formatPickupTime` helper (see Design decisions — Date formatting)
- Below the order's `createdAt` date, show pickup time if present: `Pickup: 12:30 PM`
- If `pickupAt` is `null` or absent, show nothing — do not show "No pickup time selected"

### Acceptance criteria

- [ ] Student can place an order without choosing a slot (backward compatible)
- [ ] Student can place an order with a slot and see it on the orders page
- [ ] Only slots `>= floorToSlot(now)` are shown; the active in-progress slot remains visible
- [ ] An invalid `pickupAt` in the POST body returns `400` with a descriptive message
- [ ] A `pickupAt` with non-zero seconds or milliseconds returns `400`
- [ ] `pickupAt` is persisted correctly and returned in GET `/api/orders` responses

---

## Phase 2 — Capacity-capped slots

### What it does

Extends Phase 1 so each slot has a maximum capacity (default: **10 orders per slot**). When a slot is full, it is shown as disabled in the UI and the API rejects attempts to book it.

### Why

Without a cap, every student picks 12:00 and the problem shifts from a physical queue to a kitchen overload at one time window.

### Capacity constant

Define a module-level constant in `src/lib/services/order.ts`:

```ts
const SLOT_CAPACITY = 10;
```

This is the only place the number lives. No magic numbers elsewhere.

### Service change — `generateLunchSlots` utility

Export (or keep module-level) the following helper in `src/lib/services/order.ts`:

```ts
function generateLunchSlots(date: Date): Date[] // returns 10 Date objects (11:30–13:45 local)
```

Both the API endpoint and the test suite use this function directly to avoid duplicating the slot list logic.

### Service change — slot availability query

Add a new static method to `OrderService`:

```ts
static async slotAvailability(date: Date): Promise<Record<string, number>>
```

- Accepts a `Date` representing the target local date (typically today)
- Queries `prisma.order.groupBy` on `pickupAt`, counting orders where `pickupAt` falls within the lunch window for that **local** date — compute `startOfDay` and `endOfDay` using local-time `setHours`:
  ```ts
  const start = new Date(date); start.setHours(11, 30, 0, 0);
  const end   = new Date(date); end.setHours(13, 45, 0, 0);
  ```
- Returns a map of `slot.toISOString() → count`, e.g. `{ "2026-04-28T06:00:00.000Z": 7 }` (the UTC ISO string of the local 12:00 slot)
- Slots with zero bookings are not in the map (absence = 0)

### Service change — enforce capacity in `OrderService.create`

Refactor `OrderService.create` to use `prisma.$transaction()` (see Design decisions — Concurrency). Inside the transaction:

1. Run the Phase 1 validation checks (outside the transaction is fine for pure validation; the DB query must be inside)
2. If `pickupAt` is provided, call `slotAvailability` **using the transaction client `tx`**, not the global `prisma`
3. If `count >= SLOT_CAPACITY`, throw `Error("slot is full")` — the transaction rolls back automatically
4. Proceed with `tx.order.create(...)`

### API change — GET `/api/orders/slots`

Create a new route `src/app/api/orders/slots/route.ts`:

- Protected with `withAuth`
- Reads optional `?date=YYYY-MM-DD` query param; defaults to today
- Parse the date as local: `const [y, m, d] = param.split("-").map(Number); const date = new Date(y, m - 1, d);`
- Calls `OrderService.slotAvailability(date)` and `generateLunchSlots(date)`
- Returns an array of slot objects (all 10 slots, including past ones):

```json
[
  { "time": "2026-04-28T08:30:00.000Z", "available": true,  "remaining": 10 },
  { "time": "2026-04-28T08:45:00.000Z", "available": true,  "remaining": 8  },
  { "time": "2026-04-28T09:00:00.000Z", "available": false, "remaining": 0  }
]
```

- `available` is `false` when `slot < floorToSlot(now)` (past) **or** when `count >= SLOT_CAPACITY` (full)
- `remaining` is `Math.max(0, SLOT_CAPACITY - count)`
- `time` is `slot.toISOString()`

### UI change — `MenuClient`

Replace the client-side slot generation from Phase 1 with a fetch to `GET /api/orders/slots`:

- Fetch on mount using `useEffect`, but only when the user is logged in (`!!session?.user`) since the route is protected
- Track `slots` state as `SlotInfo[] | null` (null = loading, empty array = no slots)
- While `slots === null`, render `"Loading slots…"` text in the slot picker area — **do not disable "Place order →"**
- If the fetch fails, set `slots` to `[]` and render `"Slots unavailable"` — order without slot proceeds normally
- Render each slot pill using the `available` field from the API response:
  - `available: false` → disabled + muted style, click is ignored entirely
  - `available: true && remaining <= 3` → show `"X left"` badge (only when `remaining >= 1`)
  - `available: true && remaining > 3` → normal selectable style
- Clicking a selected pill deselects it (same as Phase 1)
- After a successful order, re-fetch slots to reflect the new booking count

### Acceptance criteria

- [ ] Slots with 10 or more orders are shown as disabled in the UI
- [ ] Attempting to POST an order to a full slot via the API returns `400` with `"slot is full"`
- [ ] `GET /api/orders/slots` returns correct `remaining` counts reflecting live order data
- [ ] Slots with 1–3 remaining show a count badge; slots with 0 remaining show no badge (pill is disabled)
- [ ] Past slots are returned with `available: false` and are non-interactive
- [ ] `SLOT_CAPACITY` is defined in exactly one place
- [ ] Concurrent POST requests cannot both succeed for the 10th spot in the same slot (transaction enforces this)

---

## Files touched (both phases)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `pickupAt DateTime?` to `Order` |
| `prisma/migrations/…` | New migration generated by Prisma |
| `src/types/index.ts` | Add `pickupAt?` to `CreateOrderInput` |
| `src/lib/services/order.ts` | `floorToSlot` + `generateLunchSlots` helpers; `create` validates + stores `pickupAt` (inside transaction in Phase 2); `slotAvailability` method (Phase 2) |
| `src/app/api/orders/route.ts` | Forward `pickupAt` from body; wrap `create` in try/catch → 400 |
| `src/app/api/orders/slots/route.ts` | New route — slot availability (Phase 2) |
| `src/app/menu/_components/menu-client.tsx` | Slot selector UI in cart bar; Phase 2 replaces client generation with fetch |
| `src/app/orders/page.tsx` | `formatPickupTime` helper; show `pickupAt` on order cards |

## Out of scope

- Multi-day advance ordering — slots are always for today only
- Admin UI to change `SLOT_CAPACITY` at runtime
- Kitchen display grouped by slot
- Notifications when pickup time is approaching (separate feature)
- Payment integration
- Caching slot counts (Redis etc.) — `slotAvailability` queries the DB on every POST; acceptable for workshop scale
