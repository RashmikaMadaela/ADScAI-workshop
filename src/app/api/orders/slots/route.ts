import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/wrappers";
import { OrderService, generateLunchSlots, SLOT_CAPACITY } from "@/lib/services/order";

function floorToSlot(d: Date): Date {
  const out = new Date(d);
  out.setMinutes(Math.floor(out.getMinutes() / 15) * 15, 0, 0);
  return out;
}

export const GET = withAuth(async (req, _ctx) => {
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date");

  let date: Date;
  if (dateParam) {
    const [y, m, d] = dateParam.split("-").map(Number);
    date = new Date(y, m - 1, d);
  } else {
    date = new Date();
  }

  const counts = await OrderService.slotAvailability(date);
  const slots = generateLunchSlots(date);
  const now = new Date();
  const floor = floorToSlot(now);

  const result = slots.map((slot) => {
    const count = counts[slot.toISOString()] ?? 0;
    const past = slot < floor;
    const full = count >= SLOT_CAPACITY;
    return {
      time: slot.toISOString(),
      available: !past && !full,
      remaining: Math.max(0, SLOT_CAPACITY - count),
    };
  });

  return NextResponse.json(result);
});
