import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { OrderService } from "@/lib/services/order";

export const dynamic = "force-dynamic";

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatDate(d: Date) {
  return new Date(d).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatPickupTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function badgeClass(status: string) {
  const s = status.toLowerCase();
  if (s === "pending") return "badge badge-pending";
  if (s === "ready") return "badge badge-ready";
  if (s === "picked_up" || s === "collected" || s === "completed") return "badge badge-collected";
  if (s === "cancelled" || s === "canceled") return "badge badge-cancelled";
  return "badge";
}

export default async function OrdersPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    redirect("/login");
  }

  const orders = await OrderService.listForUser(session.user.id);

  return (
    <section>
      <div style={{ marginBottom: "1.75rem" }}>
        <h1 style={{ fontSize: "2rem", margin: "0 0 0.4rem" }}>Your orders</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "0.95rem" }}>
          Signed in as <strong style={{ color: "var(--text)" }}>{session.user.email}</strong>.
        </p>
      </div>

      {orders.length === 0 && (
        <div
          className="card"
          style={{
            padding: "2.5rem 1.5rem",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }} aria-hidden>
            🍽
          </div>
          <h3 style={{ margin: "0 0 0.4rem" }}>No orders yet</h3>
          <p style={{ color: "var(--muted)", margin: "0 0 1rem", fontSize: "0.9rem" }}>
            Browse the menu and place your first pre-order.
          </p>
          <a href="/menu" className="btn btn-primary" style={{ textDecoration: "none" }}>
            Browse menu
          </a>
        </div>
      )}

      <div style={{ display: "grid", gap: "1rem" }}>
        {orders.map((order) => (
          <article key={order.id} className="card" style={{ padding: "1.1rem 1.25rem" }}>
            <header
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "1rem",
                marginBottom: "0.85rem",
                paddingBottom: "0.85rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Order
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: 2 }}>
                  <strong style={{ fontSize: "1.05rem", fontVariantNumeric: "tabular-nums" }}>
                    #{order.id.slice(-6).toUpperCase()}
                  </strong>
                  <span className={badgeClass(order.status)}>{order.status}</span>
                </div>
                <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 3 }}>
                  {formatDate(order.createdAt)}
                </div>
                {order.pickupAt && (
                  <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: 2 }}>
                    Pickup: {formatPickupTime(order.pickupAt)}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Total
                </div>
                <strong style={{ fontSize: "1.15rem", fontVariantNumeric: "tabular-nums" }}>
                  {formatPrice(order.totalCents)}
                </strong>
              </div>
            </header>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: "0.35rem" }}>
              {order.items.map((it) => (
                <li
                  key={it.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "0.9rem",
                  }}
                >
                  <span>
                    <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums", marginRight: "0.5rem" }}>
                      {it.quantity}×
                    </span>
                    {it.menuItem.name}
                  </span>
                  <span style={{ color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>
                    {formatPrice(it.unitPriceCents * it.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            {order.notes && (
              <p
                style={{
                  fontSize: "0.85rem",
                  color: "var(--muted)",
                  marginTop: "0.85rem",
                  marginBottom: 0,
                  paddingTop: "0.75rem",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <strong style={{ color: "var(--text)" }}>Notes:</strong> {order.notes}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
