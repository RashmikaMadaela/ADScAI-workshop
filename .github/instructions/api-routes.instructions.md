---
description: "Use when creating or modifying API route handlers in src/app/api/**. Covers withAuth wrapper, error handling patterns, response shapes, and route structure."
applyTo: "src/app/api/**"
---

# API Route Conventions

## Authentication — Always Use `withAuth`

Every route handler must be wrapped with `withAuth` from `@/lib/auth/wrappers`. It resolves the better-auth session and passes `AuthContext` as the second argument.

```ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";

export const GET = withAuth(async (req, ctx) => {
  // ctx.userId — the authenticated user's ID
  // ctx.user   — { id, email, name }
  return NextResponse.json({ ... });
});
```

- **Never** access `req.cookies` or resolve the session manually — `withAuth` handles this
- Returns `401 { error: "unauthenticated" }` automatically for unauthenticated requests
- `ctx` parameter name must match — destructure `ctx.userId`, `ctx.user` as needed

## Error Handling Pattern

Wrap service calls in `try/catch`. Any thrown `Error` returns `{ error: e.message }` with status `400`:

```ts
export const POST = withAuth(async (req, ctx) => {
  const body = await req.json();
  // validate required fields first
  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: "items required" }, { status: 400 });
  }
  try {
    const result = await SomeService.create({ userId: ctx.userId, ...body });
    return NextResponse.json(result, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unexpected error" },
      { status: 400 }
    );
  }
});
```

## Query Parameter Parsing

Use `new URL(req.url).searchParams` to read query params:

```ts
const { searchParams } = new URL(req.url);
const dateParam = searchParams.get("date"); // "2026-04-28" or null
```

**Parsing date strings as local dates** — never `new Date("YYYY-MM-DD")` (parses as UTC midnight):

```ts
// CORRECT
const [y, m, d] = dateParam.split("-").map(Number);
const date = new Date(y, m - 1, d); // local midnight

// WRONG — UTC midnight, wrong day for timezones east of UTC
const date = new Date(dateParam);
```

## Response Conventions

| Situation | Status | Body shape |
|-----------|--------|-----------|
| Created resource | `201` | The created object |
| Fetched resource(s) | `200` | Object or array |
| Validation/business error | `400` | `{ error: "message" }` |
| Unauthenticated | `401` | `{ error: "unauthenticated" }` (handled by `withAuth`) |
| Not found | `404` | `{ error: "not found" }` |

## Route File Structure

```ts
// src/app/api/orders/slots/route.ts
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService } from "@/lib/services/order";

export const GET = withAuth(async (req, ctx) => {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  let date: Date;
  if (dateParam) {
    const [y, m, d] = dateParam.split("-").map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date();
  }

  // ... call service, return response
});
```

## Services Layer

Route handlers delegate all business logic to `src/lib/services/`. Keep handlers thin:
- Parse and validate the request body
- Call service method(s)
- Return the response

No database queries directly in route handlers — all queries live in `services/`.
