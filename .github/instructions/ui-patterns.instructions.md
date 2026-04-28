---
description: "Use when creating or modifying React components or pages in src/app/**. Covers styling rules, slot picker UI, loading states, session usage, and date formatting."
applyTo: "src/app/**"
---

# UI / React Patterns

## Styling Rules

- **Plain CSS variables only** — no Tailwind, no component libraries (MUI, shadcn, etc.)
- Use existing CSS variables from `src/app/globals.css`: `--text`, `--muted`, `--border`, `--radius`, `--success`, `--success-soft`, etc.
- Use existing class names: `btn`, `btn-primary`, `btn-secondary`, `card`, `badge`, `badge-pending`, `badge-ready`, `badge-collected`
- Inline `style` props are fine for one-off layout; use class names for reusable patterns
- No new CSS frameworks or utility libraries

## Session & Auth in Client Components

Use `useSession` from `@/lib/auth/client` in client components:

```tsx
import { useSession } from "@/lib/auth/client";

const { data: session } = useSession();
const loggedIn = !!session?.user;
```

- Gate protected UI/fetches behind `!!session?.user`
- In server components/pages, use `auth.api.getSession({ headers: await headers() })` and `redirect("/login")` for unauthenticated access

## Date Formatting — No Date Libraries

Use `Intl` API only. Never install or import `date-fns`, `moment`, `dayjs`, etc.

```ts
// Pickup time display: "12:30 PM"
function formatPickupTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// General date+time display
function formatDate(d: Date) {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
```

## Slot Picker Component Rules

### State shape
```tsx
const [pickupAt, setPickupAt] = useState<string | null>(null);
// Phase 2 only:
const [slots, setSlots] = useState<SlotInfo[] | null>(null); // null = loading
```

### Slot pill interaction
- Selected pill → highlighted style
- Clicking selected pill → deselects (sets state back to `null`)
- Disabled pill (`available: false`) → ignores click entirely; no error shown
- One rule for all disabled states — no special-casing "past" vs "full"

### Loading and error states (Phase 2)
- `slots === null` (loading) → render `"Loading slots…"` in picker area
- Fetch error → `slots = []`, render `"Slots unavailable"`
- **Never disable "Place order →" during loading** — `pickupAt` is optional; blocking order flow regresses Phase 1

### Scarcity badge
Show `"X left"` badge only when `remaining >= 1 && remaining <= 3`.
Do NOT show "0 left" — pill is already visually disabled when `remaining === 0`.

### Re-fetch after order
After a successful order, re-fetch `/api/orders/slots` to reflect updated counts.

### Slot `useEffect` guard (Phase 2)
```tsx
useEffect(() => {
  if (!session?.user) return; // route is protected, skip if not logged in
  fetch("/api/orders/slots")
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(setSlots)
    .catch(() => setSlots([]));
}, [session?.user]);
```

## Success Message Pattern

```tsx
// After successful order:
if (selectedSlot) {
  // "Order placed. Pick up at 12:30 PM."
  `Order placed. Pick up at ${formatPickupTime(selectedSlot)}.`
} else {
  // "Order placed. We'll have it ready shortly."
}
```

Reset `pickupAt` to `null` after successful order.

## Orders Page — Pickup Time Display

```tsx
{order.pickupAt && (
  <p style={{ color: "var(--muted)", fontSize: "0.85rem", margin: "0.2rem 0 0" }}>
    Pickup: {formatPickupTime(order.pickupAt)}
  </p>
)}
```

Do NOT render any fallback text when `pickupAt` is absent.

## TypeScript Type for Slot (Phase 2)

```ts
type SlotInfo = {
  time: string;       // ISO 8601 string
  available: boolean;
  remaining: number;
};
```

Keep this type local to the component — no need to add it to `src/types/index.ts`.
