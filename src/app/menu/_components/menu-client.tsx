"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/client";

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  priceCents: number;
  category: string;
  available: boolean;
};

type SlotInfo = {
  time: string;
  available: boolean;
  remaining: number;
};

type Cart = Record<string, number>;

function formatPrice(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function formatPickupTime(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

const categoryEmoji: Record<string, string> = {
  main: "🍛",
  drink: "🥤",
  snack: "🥟",
  dessert: "🍰",
};

export function MenuClient({ items }: { items: MenuItem[] }) {
  const router = useRouter();
  const { data: session } = useSession();
  const [cart, setCart] = useState<Cart>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [successPickupAt, setSuccessPickupAt] = useState<string | null>(null);
  const [pickupAt, setPickupAt] = useState<string | null>(null);
  const [slots, setSlots] = useState<SlotInfo[] | null>(null);

  const fetchSlots = () => {
    fetch("/api/orders/slots")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: SlotInfo[]) => setSlots(data))
      .catch(() => setSlots([]));
  };

  useEffect(() => {
    if (!session?.user) return;
    fetchSlots();
  }, [session?.user]);

  const byCategory = useMemo(() => {
    return items.reduce<Record<string, MenuItem[]>>((acc, item) => {
      (acc[item.category] ??= []).push(item);
      return acc;
    }, {});
  }, [items]);

  const totalCents = useMemo(() => {
    return items.reduce((sum, item) => sum + (cart[item.id] ?? 0) * item.priceCents, 0);
  }, [items, cart]);

  const totalCount = Object.values(cart).reduce((a, b) => a + b, 0);

  function setQty(id: string, qty: number) {
    setSuccessId(null);
    setCart((prev) => {
      const next = { ...prev };
      if (qty <= 0) delete next[id];
      else next[id] = qty;
      return next;
    });
  }

  async function placeOrder() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: Object.entries(cart).map(([menuItemId, quantity]) => ({
            menuItemId,
            quantity,
          })),
          pickupAt: pickupAt ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Failed (${res.status})`);
      }
      const order = await res.json();
      setCart({});
      setSuccessId(order.id);
      setSuccessPickupAt(pickupAt);
      setPickupAt(null);
      fetchSlots();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  const loggedIn = !!session?.user;

  return (
    <section>
      <div style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontSize: "2rem", margin: "0 0 0.4rem" }}>Today's menu</h1>
        <p style={{ color: "var(--muted)", margin: 0, fontSize: "1rem" }}>
          Pre-order now — pick it up hot and skip the line.
        </p>
      </div>

      {successId && (
        <div
          style={{
            background: "var(--success-soft)",
            border: "1px solid var(--success)",
            color: "var(--success)",
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius)",
            marginBottom: "1.25rem",
            fontSize: "0.9rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "1rem",
          }}
        >
          <span>
            <strong>Order placed.</strong>{" "}
            {successPickupAt
              ? `Pick up at ${formatPickupTime(successPickupAt)}.`
              : "We'll have it ready shortly."}
          </span>
          <a href="/orders" className="btn btn-secondary" style={{ padding: "0.35rem 0.75rem", fontSize: "0.8rem" }}>
            View orders
          </a>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "var(--danger-soft)",
            border: "1px solid var(--danger)",
            color: "var(--danger)",
            padding: "0.85rem 1rem",
            borderRadius: "var(--radius)",
            marginBottom: "1.25rem",
            fontSize: "0.9rem",
          }}
        >
          {error}
        </div>
      )}

      {Object.entries(byCategory).map(([category, list]) => (
        <div key={category} style={{ marginBottom: "2.25rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
            <span aria-hidden style={{ fontSize: "1.2rem" }}>
              {categoryEmoji[category] ?? "•"}
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: "1.05rem",
                textTransform: "capitalize",
                fontWeight: 700,
              }}
            >
              {category}
            </h2>
            <span style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{list.length} items</span>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: "0.6rem" }}>
            {list.map((item) => {
              const qty = cart[item.id] ?? 0;
              return (
                <li
                  key={item.id}
                  className={item.available ? "card menu-item" : "card"}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "1rem",
                    padding: "1rem 1.1rem",
                    background: item.available ? "var(--card)" : "var(--card-alt)",
                    opacity: item.available ? 1 : 0.7,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "1rem" }}>{item.name}</div>
                    {item.description && (
                      <div style={{ fontSize: "0.85rem", color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>
                        {item.description}
                      </div>
                    )}
                    {!item.available && (
                      <span className="badge badge-soldout" style={{ marginTop: 6 }}>
                        Sold out
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flexShrink: 0 }}>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "0.95rem" }}>
                      {formatPrice(item.priceCents)}
                    </span>
                    {item.available && qty === 0 && (
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => {
                          if (!loggedIn) {
                            router.push("/login");
                            return;
                          }
                          setQty(item.id, 1);
                        }}
                      >
                        Add
                      </button>
                    )}
                    {item.available && loggedIn && qty > 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.5rem",
                          background: "var(--card-alt)",
                          borderRadius: 8,
                          padding: "0.25rem 0.4rem",
                        }}
                      >
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => setQty(item.id, qty - 1)}
                          aria-label="Decrease"
                        >
                          −
                        </button>
                        <span style={{ minWidth: 18, textAlign: "center", fontWeight: 600, fontSize: "0.9rem" }}>
                          {qty}
                        </span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => setQty(item.id, qty + 1)}
                          aria-label="Increase"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {totalCount > 0 && (
        <div
          style={{
            position: "sticky",
            bottom: "1rem",
            background: "#0f172a",
            color: "white",
            padding: "0.85rem 1rem 0.85rem 1.25rem",
            borderRadius: 14,
            display: "flex",
            flexDirection: "column",
            gap: "0.75rem",
            boxShadow: "var(--shadow-lg)",
            marginTop: "1.5rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
              <span
                aria-hidden
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: "var(--brand)",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                }}
              >
                {totalCount}
              </span>
              <div style={{ fontSize: "0.95rem" }}>
                <div style={{ fontSize: "0.75rem", opacity: 0.7, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Your order
                </div>
                <strong style={{ fontVariantNumeric: "tabular-nums", fontSize: "1.05rem" }}>
                  {formatPrice(totalCents)}
                </strong>
              </div>
            </div>
            <button type="button" onClick={placeOrder} disabled={submitting} className="btn btn-light">
              {submitting ? "Placing…" : "Place order →"}
            </button>
          </div>

          <div>
            <div style={{ fontSize: "0.7rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>
              Pickup time (optional)
            </div>
            {slots === null ? (
              <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Loading slots…</span>
            ) : slots.length === 0 ? (
              <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Slots unavailable</span>
            ) : slots.every((s) => !s.available) ? (
              <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>No slots available today</span>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {slots.map((slot) => {
                  const isSelected = pickupAt === slot.time;
                  const isDisabled = !slot.available;
                  return (
                    <button
                      key={slot.time}
                      type="button"
                      onClick={() => {
                        if (isDisabled) return;
                        setPickupAt(isSelected ? null : slot.time);
                      }}
                      style={{
                        padding: "0.3rem 0.65rem",
                        borderRadius: 8,
                        border: isSelected ? "2px solid white" : "1px solid rgba(255,255,255,0.25)",
                        background: isSelected
                          ? "white"
                          : isDisabled
                          ? "rgba(255,255,255,0.05)"
                          : "rgba(255,255,255,0.1)",
                        color: isSelected ? "#0f172a" : isDisabled ? "rgba(255,255,255,0.3)" : "white",
                        fontSize: "0.8rem",
                        fontWeight: isSelected ? 700 : 400,
                        cursor: isDisabled ? "default" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      {formatPickupTime(slot.time)}
                      {slot.available && slot.remaining >= 1 && slot.remaining <= 3 && (
                        <span
                          style={{
                            fontSize: "0.7rem",
                            background: "rgba(255,200,0,0.25)",
                            color: "rgb(255,200,0)",
                            borderRadius: 4,
                            padding: "0 0.3rem",
                            fontWeight: 600,
                          }}
                        >
                          {slot.remaining} left
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
