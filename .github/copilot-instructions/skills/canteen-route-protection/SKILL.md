---
name: canteen-route-protection
description: Use when creating or editing API routes in the canteen workshop repo — any file under src/app/api/. Enforces the mandatory withAuth wrapper, delegation to the service layer, and HTTP-only concerns in route handlers.
---

# Canteen Route Protection

All API routes **must** use the `withAuth` HOC from `@/lib/auth/wrappers`. Routes delegate to services and handle HTTP concerns only — validation, status codes, request parsing.

## Template

```typescript
import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService } from "@/lib/services/order";

export const POST = withAuth(async (req, ctx) => {
  const data = await req.json();
  if (!data.requiredField) {
    return NextResponse.json({ error: "missing field" }, { status: 400 });
  }
  const result = await OrderService.create({ ...data, userId: ctx.userId });
  return NextResponse.json(result);
});
```

## Rules

- **Never bypass `withAuth`.** No raw `export async function GET/POST`.
- **Never call Prisma directly.** Delegate to a service method.
- **Validate at the boundary** — check required fields, return 400 with a clear error.
- **Route handlers should be thin** — if more than ~30 lines of logic, extract to a service.
- The custom ESLint rule `require-auth-wrapper` will fail the build if a route is exported without the HOC. Do not disable it.
